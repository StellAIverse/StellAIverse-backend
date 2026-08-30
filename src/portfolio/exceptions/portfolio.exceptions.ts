import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";

export class PortfolioNotFoundException extends NotFoundException {
  constructor(portfolioId: string) {
    super(`Portfolio not found: ${portfolioId}`);
  }
}

export class PortfolioAccessDeniedException extends ForbiddenException {
  constructor(portfolioId: string, userId: string) {
    super(
      `Access denied: User ${userId} does not have permission to access portfolio ${portfolioId}`,
    );
  }
}

export class InsufficientBalanceException extends BadRequestException {
  constructor(asset: string) {
    super(`Insufficient balance for asset ${asset}`);
  }
}

export class OptimizationFailedException extends BadRequestException {
  constructor(message = "Portfolio optimization failed") {
    super(message);
  }
}

export class DuplicatePortfolioNameException extends ConflictException {
  constructor(name: string) {
    super(`A portfolio with the name "${name}" already exists`);
  }
}

export class InvalidPortfolioException extends BadRequestException {
  constructor(message: string) {
    super(message);
  }
}

export class PortfolioHasNoAssetsException extends BadRequestException {
  constructor(portfolioId: string) {
    super(
      `Portfolio ${portfolioId} has no assets. Add at least one asset before performing this operation.`,
    );
  }
}

export class AssetNotFoundException extends NotFoundException {
  constructor(assetId: string, portfolioId: string) {
    super(`Asset ${assetId} not found in portfolio ${portfolioId}`);
  }
}

export class DuplicateAssetException extends ConflictException {
  constructor(ticker: string, chain: string, portfolioId: string) {
    super(
      `Asset ${ticker} on chain ${chain} already exists in portfolio ${portfolioId}`,
    );
  }
}

export class InvalidTickerException extends BadRequestException {
  constructor(ticker: string) {
    super(
      `Invalid ticker symbol "${ticker}": must be 3-10 uppercase alphanumeric characters`,
    );
  }
}

export class UnsupportedChainException extends BadRequestException {
  constructor(chain: string, supported: string[]) {
    super(
      `Unsupported chain "${chain}": must be one of ${supported.join(", ")}`,
    );
  }
}

export class OptimizationNotFoundException extends NotFoundException {
  constructor(optimizationId: string) {
    super(`Optimization not found: ${optimizationId}`);
  }
}

export class RebalancingEventNotFoundException extends NotFoundException {
  constructor(eventId: string) {
    super(`Rebalancing event not found: ${eventId}`);
  }
}

export class BacktestNotFoundException extends NotFoundException {
  constructor(backtestId: string) {
    super(`Backtest not found: ${backtestId}`);
  }
}

export class TransactionNotFoundException extends NotFoundException {
  constructor(transactionId: string) {
    super(`Transaction not found: ${transactionId}`);
  }
}
