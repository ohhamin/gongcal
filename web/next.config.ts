import type { NextConfig } from 'next';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
    // monorepo 하위 web/에서 실행될 때 Turbopack이 웹 프로젝트 루트를 정확히 잡도록 고정합니다.
    turbopack: {
        root: webRoot,
    },
    // 로컬 브라우저에서 개발 서버를 볼 때 Next dev origin 검사를 명시적으로 통과시킵니다.
    allowedDevOrigins: ['localhost:3000', '127.0.0.1:3000'],
};

export default nextConfig;
