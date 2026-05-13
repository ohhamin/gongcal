import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    // 로컬 브라우저에서 개발 서버를 볼 때 Next dev origin 검사를 명시적으로 통과시킵니다.
    allowedDevOrigins: ['localhost:3000', '127.0.0.1:3000'],
};

export default nextConfig;
