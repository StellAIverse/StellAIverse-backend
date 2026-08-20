import { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle("StellAIverse Backend API")
    .setDescription(
      "Comprehensive API documentation for StellAIverse backend services including " +
        "portfolio management, agent management, oracle submissions, compute operations, " +
        "and audit trails.\n\n" +
        "## Portfolio Management\n" +
        "Endpoints for portfolio CRUD operations, asset management, optimization, " +
        "rebalancing, performance analytics, backtesting, and ML predictions.\n\n" +
        "### Rate Limiting\n" +
        "- **Global**: 100 requests/minute\n" +
        "- **Trading (Portfolio)**: 20 requests/minute\n" +
        "- **Auth**: 5 requests/minute\n\n" +
        "### Authentication\n" +
        "All portfolio endpoints require JWT Bearer token authentication.",
    )
    .setVersion("1.0.0")
    .setContact(
      "StellAIverse Team",
      "https://stellaiverse.com",
      "api@stellaiverse.com",
    )
    .setLicense("Apache 2.0", "https://www.apache.org/licenses/LICENSE-2.0")
    .addServer("http://localhost:3000/api/v1", "Development Server")
    .addServer("https://api.stellaiverse.com/api/v1", "Production Server")
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        name: "JWT",
        description: "Enter JWT token",
        in: "header",
      },
      "JWT-auth",
    )
    .addApiKey(
      {
        type: "apiKey",
        name: "X-API-Key",
        in: "header",
        description: "API key for service-to-service communication",
      },
      "api-key",
    )
    .addTag("Authentication", "User authentication and authorization")
    .addTag("Users", "User management operations")
    .addTag("Oracle", "Oracle data submissions")
    .addTag("Audit", "Audit trail and logging")
    .addTag("Profile", "User profile management")
    .addTag(
      "Portfolio Management",
      "Portfolio CRUD, optimization, rebalancing, and analytics. " +
        "Includes endpoints for creating, reading, updating, and archiving portfolios, " +
        "managing assets, running optimizations, and tracking performance.",
    )
    .addTag(
      "Portfolio Assets",
      "Asset (holding) management within portfolios. " +
        "Supports multi-chain assets with cost basis tracking and unrealized gain/loss.",
    )
    .addTag(
      "Portfolio Optimization",
      "Portfolio optimization using Modern Portfolio Theory, " +
        "Black-Litterman model, risk parity, and ML-based strategies.",
    )
    .addTag(
      "Portfolio Rebalancing",
      "Portfolio rebalancing triggers, execution, and history. " +
        "Supports manual, time-based, threshold-based, and ML-triggered rebalancing.",
    )
    .addTag(
      "Portfolio Analytics",
      "Performance analytics including returns, volatility, Sharpe ratio, " +
        "Sortino ratio, VaR, drawdown, and benchmark comparison.",
    )
    .addTag(
      "Portfolio Backtesting",
      "Historical backtesting of portfolio strategies with performance metrics.",
    )
    .addTag(
      "ML Predictions",
      "Machine learning-based price predictions for portfolio assets.",
    )
    .addTag(
      "Portfolio Transactions",
      "Transaction recording, history, cost basis calculation, and export.",
    )
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    deepScanRoutes: true,
    operationIdFactory: (controllerKey: string, methodKey: string) => methodKey,
  });

  SwaggerModule.setup("api/docs", app, document, {
    customSiteTitle: "StellAIverse API Documentation",
    customfavIcon: "/favicon.ico",
    customCss: `
      .topbar-wrapper img { content: url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTAiIGhlaWdodD0iNTAiIHZpZXdCb3g9IjAgMCA1MCA1MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjUwIiBoZWlnaHQ9IjUwIiByeD0iMTAiIGZpbGw9IiM0Mjg1RjQiLz4KPHN2ZyB3aWR0aD0iMzAiIGhlaWdodD0iMzAiIHZpZXdCb3g9IjAgMCAzMCAzMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4PSIxMCIgeT0iMTAiPgo8Y2lyY2xlIGN4PSIxNSIgY3k9IjE1IiByPSI4IiBmaWxsPSJ3aGl0ZSIvPgo8L3N2Zz4KPC9zdmc+'); }
      .swagger-ui .topbar { background-color: #4285F4; }
      .swagger-ui .topbar-wrapper .link { color: white; }
    `,
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      showExtensions: true,
      showCommonExtensions: true,
      docExpansion: "none",
      defaultModelsExpandDepth: 2,
      defaultModelExpandDepth: 2,
      tryItOutEnabled: true,
      tagsSorter: "alpha",
      operationsSorter: "alpha",
    },
  });
}