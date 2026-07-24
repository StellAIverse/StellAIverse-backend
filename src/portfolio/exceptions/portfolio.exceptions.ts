import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";

export class PortfolioNotFoundException extends NotFoundException {
  constructor(portfolioId: string) {
    super(`Portfolio not found: ${portfolioId}`);
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
