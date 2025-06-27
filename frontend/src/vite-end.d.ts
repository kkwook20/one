/// <reference types="vite/client" />

// Python 파일을 URL로 import할 수 있도록 타입 정의
declare module '*.py?url' {
  const url: string
  export default url
}

// Python 파일을 raw text로 import할 수 있도록 타입 정의
declare module '*.py?raw' {
  const content: string
  export default content
}

// .txt 파일을 raw text로 import
declare module '*.txt?raw' {
  const content: string
  export default content
}

// 일반적인 Vite 환경 변수 타입
interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string
  // 더 많은 환경 변수...
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}