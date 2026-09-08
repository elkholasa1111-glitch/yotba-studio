// ============================================================
// Admin Moderation API — طابور البلاغات الحقيقي
// ============================================================

import { NextResponse } from 'next/server';
import { isValidObjectId } from 'mongoose';
import { getCurrentAdmin } from '@/lib/auth';
import { connectDB } from '@/lib/db/connect';
import { CommentReport, Comment, User, AdminAuditLog } from '@/lib/db/models';

// GET: جلب البلاغات المعلقة
export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'غير مصرح لك' }, { status: 401 });
  }

  const conn = await connectDB();
  if (!conn) {
    return NextResponse.json({ error: 'قاعدة البيانات غير متاحة حالياً' }, { status: 503 });
  }

  try {
    const reports = await CommentReport.find({ status: 'PENDING' })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const commentIds = reports.map((r: any) => r.commentId).filter(Boolean);
    const comments = commentIds.length > 0 ? await Comment.find({ _id: { $in: commentIds } }).lean() : [];
    const commentMap = new Map(comments.map((c: any) => [c._id.toString(), c]));

    const userIds = comments.map((c: any) => c.userId).filter(Boolean);
    const users = userIds.length > 0 ? await User.find({ _id: { $in: userIds } }).select('displayName').lean() : [];
    const userMap = new Map(users.map((u: any) => [u._id.toString(), u.displayName]));

    return NextResponse.json({
      reports: reports.map((r: any) => {
        const comment = commentMap.get(r.commentId?.toString());
        return {
          _id: r._id.toString(),
          reason: r.reason,
          createdAt: r.createdAt,
          comment: comment
            ? {
                content: comment.content,
                authorName: userMap.get(comment.userId?.toString()) || 'مستمع',
                episodeId: comment.episodeId?.toString(),
              }
            : null,
        };
      }),
    });  } catch (error) {
    console.error('Admin moderation GET error:', error);
    return NextResponse.json({ error: 'فشل جلب البلاغات' }, { status: 500 });
  }
}

// POST: اتخاذ إجراء على بلاغ (حذف التعليق أو تجاهل)
export async function POST(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'غير مصرح لك' }, { status: 401 });
  }
  if (!['SUPER_ADMIN', 'ADMIN', 'MODERATOR'].includes(admin.role)) {
    return NextResponse.json({ error: 'ليس لديك صلاحية الإشراف' }, { status: 403 });
  }

  try {
    const { reportId, action } = await req.json();
    if (typeof reportId !== 'string' || !isValidObjectId(reportId) || !['REMOVE_COMMENT', 'DISMISS'].includes(action)) {
      return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 });
    }

    const conn = await connectDB();
    if (!conn) {
      return NextResponse.json({ error: 'قاعدة البيانات غير متاحة' }, { status: 503 });
    }

    const report = await CommentReport.findById(reportId);
    if (!report) {
      return NextResponse.json({ error: 'البلاغ غير موجود' }, { status: 404 });
    }
    if (report.status !== 'PENDING') {
      return NextResponse.json({ error: 'تمت معالجة هذا البلاغ مسبقاً' }, { status: 409 });
    }

    const previousState = { status: report.status };
    const nextStatus = action === 'REMOVE_COMMENT' ? 'RESOLVED' : 'DISMISSED';

    if (action === 'REMOVE_COMMENT') {
      await Comment.findByIdAndUpdate(report.commentId, { status: 'REMOVED_BY_ADMIN' });
    }

    report.status = nextStatus;
    report.reviewedByAdminId = admin.userId as any;
    await report.save();

    await AdminAuditLog.create({
      adminUserId: admin.userId,
      action: action === 'REMOVE_COMMENT' ? 'REMOVE_COMMENT' : 'DISMISS_REPORT',
      targetEntity: action === 'REMOVE_COMMENT' ? 'Comment' : 'CommentReport',
      entityId: action === 'REMOVE_COMMENT' ? report.commentId?.toString() || '' : reportId,
      previousState,
      newState: { status: nextStatus, reportId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin moderation POST error:', error);
    return NextResponse.json({ error: 'فشل معالجة البلاغ' }, { status: 500 });
  }
}
