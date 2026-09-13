import nextVitals from 'eslint-config-next/core-web-vitals';

const config = [
  ...nextVitals,
  {
    rules: {
      // These React 19 compiler diagnostics are opt-in for this React 18 app;
      // the existing effects intentionally synchronize remote/session state.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/immutability': 'off',
      'import/no-anonymous-default-export': 'off',
    },
  },
];

export default config;
