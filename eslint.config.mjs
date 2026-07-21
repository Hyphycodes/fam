import coreWebVitals from 'eslint-config-next/core-web-vitals'
import typescript from 'eslint-config-next/typescript'

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'scripts/**', 'public/sw.js'] },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      /*
       * Media comes from R2 signed URLs and Cloudflare Stream — hosts that
       * rotate per request. next/image can't optimise those without proxying
       * every private photo through our own function, which is exactly what the
       * signed-URL model exists to avoid.
       */
      '@next/next/no-img-element': 'off',
    },
  },
]

export default config
