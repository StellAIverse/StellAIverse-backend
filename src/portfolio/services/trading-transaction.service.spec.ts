import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { TradingTransactionService } from "./trading-transaction.service";
import { Transaction, TransactionType, TransactionStatus } from "../entities/transaction.entity";
import { PortfolioAsset } from "../entities/portfolio-asset.entity";
import { Portfolio } from "../entities/portfolio.entity";
import {
  InsufficientBalanceException,
  PortfolioNotFoundException,
} from "../exceptions/portfolio.exceptions";
import { ConflictException, BadRequestException } from "@nestjs/common";

describe("TradingTransactionService", () => {
  let service: TradingTransactionService;
  let transactionRepository: Repository<Transaction>;
  let dataSource: DataSource;

  const mockPortfolio = (): Portfolio => {
    const portfolio = new Portfolio();
    portfolio.id = "portfolio-1";
    portfolio.userId = "user-1";
    portfolio.name = "Test Portfolio";
    return portfolio;
  };

  const mockAsset = (): PortfolioAsset => {
    const asset = new PortfolioAsset();
    asset.id = "asset-1";
    asset.portfolioId = "portfolio-1";
    asset.ticker = "AAPL";
    asset.name = "Apple Inc";
    asset.quantity = 100;
    asset.currentPrice = 150;
    asset.value = 15000;
    return asset;
  };

  const mockTransaction = (): Transaction => {
    const tx = new Transaction();
    tx.id = "tx-1";
    tx.portfolioId = "portfolio-1";
    tx.userId = "user-1";
    tx.type = TransactionType.BUY;
    tx.status = TransactionStatus.COMPLETED;
    tx.ticker = "AAPL";
    tx.name = "Apple Inc";
    tx.quantity = 10;
    tx.price = 150;
    tx.totalValue = 1500;
    tx.fees = 0;
    tx.createdAt = new Date();
    return tx;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TradingTransactionService,
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TradingTransactionService>(TradingTransactionService);
    dataSource = module.get<DataSource>(DataSource);
    transactionRepository = module.get<Repository<Transaction>>(
      getRepositoryToken(Transaction),
    );
  });

  describe("executeTrade", () => {
    it("should execute a buy trade and record transaction", async () => {
      const portfolio = mockPortfolio();
      const asset = mockAsset();
      asset.quantity = 0; // Starting with no shares

      let savedAsset: PortfolioAsset;
      let savedTransaction: Transaction;

      const mockManager = {
        getRepository: (entity: any) => {
          if (entity === Portfolio) {
            return {
              createQueryBuilder: jest.fn().mockReturnValue({
                setLock: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                getOne: jest.fn().mockResolvedValue(portfolio),
              }),
            };
          } else if (entity === PortfolioAsset) {
            return {
              findOne: jest.fn().mockResolvedValue(asset),
              save: jest.fn().mockImplementation((a) => {
                savedAsset = a;
                return Promise.resolve(a);
              }),
            };
          } else if (entity === Transaction) {
            return {
              create: jest.fn().mockImplementation((dto) => {
                savedTransaction = Object.assign(new Transaction(), dto);
                return savedTransaction;
              }),
              save: jest.fn().mockResolvedValue(savedTransaction),
            };
          }
        },
      };

      jest.spyOn(dataSource, "transaction").mockImplementation(async (_, cb) => {
        return cb(mockManager as any);
      });

      const result = await service.executeTrade({
        portfolioId: "portfolio-1",
        userId: "user-1",
        ticker: "AAPL",
        name: "Apple Inc",
        quantity: 10,
        price: 150,
        idempotencyKey: "key-1",
      });

      expect(result.quantity).toBe(10);
      expect(savedTransaction).toBeDefined();
      expect(savedTransaction.type).toBe(TransactionType.BUY);
      expect(savedTransaction.quantity).toBe(10);
    });

    it("should throw ConflictException if idempotency key already processed", async () => {
      const operation = {
        portfolioId: "portfolio-1",
        userId: "user-1",
        ticker: "AAPL",
        name: "Apple Inc",
        quantity: 10,
        price: 150,
        idempotencyKey: "key-1",
      };

      // Process once
      const mockManager = {
        getRepository: (entity: any) => {
          if (entity === Portfolio) {
            return {
              createQueryBuilder: jest.fn().mockReturnValue({
                setLock: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                getOne: jest.fn().mockResolvedValue(mockPortfolio()),
              }),
            };
          } else if (entity === PortfolioAsset) {
            return {
              findOne: jest.fn().mockResolvedValue(mockAsset()),
              save: jest.fn().mockResolvedValue(mockAsset()),
            };
          } else if (entity === Transaction) {
            return {
              create: jest.fn().mockReturnValue(mockTransaction()),
              save: jest.fn().mockResolvedValue(mockTransaction()),
            };
          }
        },
      };

      jest.spyOn(dataSource, "transaction").mockImplementation(async (_, cb) => {
        return cb(mockManager as any);
      });

      await service.executeTrade(operation);

      // Try to process the same key again
      await expect(service.executeTrade(operation)).rejects.toThrow(ConflictException);
    });

    it("should throw PortfolioNotFoundException if portfolio not found", async () => {
      const mockManager = {
        getRepository: (entity: any) => {
          if (entity === Portfolio) {
            return {
              createQueryBuilder: jest.fn().mockReturnValue({
                setLock: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                getOne: jest.fn().mockResolvedValue(null),
              }),
            };
          }
        },
      };

      jest.spyOn(dataSource, "transaction").mockImplementation(async (_, cb) => {
        return cb(mockManager as any);
      });

      await expect(
        service.executeTrade({
          portfolioId: "invalid-portfolio",
          userId: "user-1",
          ticker: "AAPL",
          name: "Apple Inc",
          quantity: 10,
          price: 150,
          idempotencyKey: "key-1",
        }),
      ).rejects.toThrow(PortfolioNotFoundException);
    });

    it("should throw InsufficientBalanceException if selling more than available", async () => {
      const portfolio = mockPortfolio();
      const asset = mockAsset();
      asset.quantity = 5; // Only have 5 shares

      const mockManager = {
        getRepository: (entity: any) => {
          if (entity === Portfolio) {
            return {
              createQueryBuilder: jest.fn().mockReturnValue({
                setLock: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                getOne: jest.fn().mockResolvedValue(portfolio),
              }),
            };
          } else if (entity === PortfolioAsset) {
            return {
              findOne: jest.fn().mockResolvedValue(asset),
              save: jest.fn(),
            };
          }
        },
      };

      jest.spyOn(dataSource, "transaction").mockImplementation(async (_, cb) => {
        return cb(mockManager as any);
      });

      await expect(
        service.executeTrade({
          portfolioId: "portfolio-1",
          userId: "user-1",
          ticker: "AAPL",
          name: "Apple Inc",
          quantity: -10, // Try to sell 10
          price: 150,
          idempotencyKey: "key-1",
        }),
      ).rejects.toThrow(InsufficientBalanceException);
    });
  });

  describe("recordTransaction", () => {
    it("should record a transaction directly", async () => {
      const tx = mockTransaction();
      jest.spyOn(transactionRepository, "create").mockReturnValue(tx);
      jest.spyOn(transactionRepository, "save").mockResolvedValue(tx);

      const result = await service.recordTransaction("portfolio-1", "user-1", {
        type: TransactionType.DIVIDEND,
        ticker: "AAPL",
        name: "Apple Inc",
        quantity: 10,
        price: 1.5,
      });

      expect(result).toBeDefined();
      expect(transactionRepository.save).toHaveBeenCalled();
    });

    it("should throw ConflictException if idempotency key already exists", async () => {
      jest.spyOn(transactionRepository, "findOne").mockResolvedValue(mockTransaction());

      await expect(
        service.recordTransaction("portfolio-1", "user-1", {
          type: TransactionType.DIVIDEND,
          ticker: "AAPL",
          name: "Apple Inc",
          quantity: 10,
          price: 1.5,
          idempotencyKey: "key-1",
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("should throw BadRequestException if quantity is zero", async () => {
      await expect(
        service.recordTransaction("portfolio-1", "user-1", {
          type: TransactionType.BUY,
          ticker: "AAPL",
          name: "Apple Inc",
          quantity: 0,
          price: 150,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException if price is invalid for BUY", async () => {
      await expect(
        service.recordTransaction("portfolio-1", "user-1", {
          type: TransactionType.BUY,
          ticker: "AAPL",
          name: "Apple Inc",
          quantity: 10,
          price: -150,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException if fees are negative", async () => {
      await expect(
        service.recordTransaction("portfolio-1", "user-1", {
          type: TransactionType.BUY,
          ticker: "AAPL",
          name: "Apple Inc",
          quantity: 10,
          price: 150,
          fees: -10,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException if gas fees are negative", async () => {
      await expect(
        service.recordTransaction("portfolio-1", "user-1", {
          type: TransactionType.BUY,
          ticker: "AAPL",
          name: "Apple Inc",
          quantity: 10,
          price: 150,
          gasFees: -5,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should calculate total value if not provided", async () => {
      const tx = mockTransaction();
      let savedTx: Transaction;

      jest.spyOn(transactionRepository, "create").mockImplementation((dto) => {
        savedTx = Object.assign(new Transaction(), dto);
        return savedTx;
      });

      jest.spyOn(transactionRepository, "save").mockResolvedValue(savedTx);

      await service.recordTransaction("portfolio-1", "user-1", {
        type: TransactionType.BUY,
        ticker: "AAPL",
        name: "Apple Inc",
        quantity: 10,
        price: 150,
      });

      expect(savedTx.totalValue).toBe(1500);
    });
  });

  describe("getTransaction", () => {
    it("should get a transaction by ID", async () => {
      const tx = mockTransaction();
      jest.spyOn(transactionRepository, "findOne").mockResolvedValue(tx);

      const result = await service.getTransaction("tx-1");

      expect(result).toEqual(tx);
      expect(transactionRepository.findOne).toHaveBeenCalledWith({
        where: { id: "tx-1" },
      });
    });
  });
});
