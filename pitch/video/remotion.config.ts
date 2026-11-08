import { existsSync } from 'node:fs'
import path from 'node:path'
import { Config } from '@remotion/cli/config'

Config.setVideoImageFormat('jpeg')
Config.setJpegQuality(92)
// Программный WebGL для 3D-сцен; системный Chrome только если он есть (Linux), иначе Remotion скачает свой.
Config.setChromiumOpenGlRenderer('swangle')
if (existsSync('/usr/bin/google-chrome')) Config.setBrowserExecutable('/usr/bin/google-chrome')

// Геометрия монет импортируется из pitch/slides/src/coins.ts. Чтобы там и здесь был один экземпляр three
// (иначе R3F не узнает объекты), three всегда берётся из node_modules ролика.
Config.overrideWebpackConfig((config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    alias: {
      ...(config.resolve?.alias ?? {}),
      three$: path.resolve(process.cwd(), 'node_modules/three/build/three.module.js'),
      'three/examples': path.resolve(process.cwd(), 'node_modules/three/examples'),
    },
  },
}))
