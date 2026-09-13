'use client';

import React from 'react';
import Image, { ImageProps } from 'next/image';

type AdaptiveImageProps = Omit<ImageProps, 'src' | 'alt' | 'fill'> & {
  src: string;
  alt: string;
  /** Cover is the default; containment is an explicit per-surface decision. */
  fit?: 'cover' | 'contain';
  /** Add a soft backdrop when containment is selected. */
  backdrop?: boolean;
};

/** مُكوّن موحّد للصور: يحافظ على الـ cover السينمائي افتراضيًا، ويتيح
 * الاحتواء فقط في الأسطح التي تحتاجه صراحةً. */
export const AdaptiveImage: React.FC<AdaptiveImageProps> = ({
  src,
  alt,
  fit = 'cover',
  backdrop = true,
  className = '',
  ...imageProps
}) => {
  if (!src || typeof src !== 'string' || !src.trim()) {
    return <div className={`bg-white/5 ${className}`} aria-hidden="true" />;
  }

  const baseClassName = className
    .split(/\s+/)
    .filter((token) => !/^object-(cover|contain|fill|none|scale-down)$/.test(token))
    .join(' ');
  const foregroundClass = `${baseClassName} ${fit === 'contain' ? 'object-contain' : 'object-cover'}`.trim();

  return (
    <>
      {fit === 'contain' && backdrop && (
        <Image
          {...imageProps}
          src={src}
          alt=""
          aria-hidden="true"
          fill
          sizes={imageProps.sizes}
          className="object-cover scale-110 blur-2xl opacity-40"
          priority={false}
        />
      )}
        <Image
          {...imageProps}
          src={src}
          alt={alt}
          fill
          className={foregroundClass}
        />
    </>
  );
};
