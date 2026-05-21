"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { rawBody: true });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        transform: true,
        forbidUnknownValues: false,
    }));
    const frontend = process.env.FRONTEND_URL || 'http://localhost:5173';
    const allowedOrigins = Array.from(new Set([frontend, 'http://localhost:5173', 'http://127.0.0.1:5173']));
    app.enableCors({ origin: allowedOrigins, credentials: true });
    const port = Number(process.env.PORT) || 4000;
    await app.listen(port);
}
bootstrap();
//# sourceMappingURL=main.js.map