import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { TransactionHistoryService } from "./transaction-history.service";
import { Transaction, TransactionType, TransactionStatus } from "../entities/transaction.entity";
import { CreateTransactionDto, TransactionFilterDto } from "../dto/transaction.dto";
import { NotFoundException, BadRequestException } from "@nestjs/common";

describe("TransactionHistoryService", () => {
  let service: TransactionHistoryService;
  let repository: Repository<Transaction>;

  const mockTransaction = (
    overrides?: Partial<Transaction>,
  ): Transaction => {
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
    tx.createdAt = new Date("2024-01-01");
    tx.transactionDate = new Date("2024-01-01");
    tx.archivedAt = null;
    return Object.assign(tx, overrides);
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionHistoryService,
        {
          provide: getRepositoryToken(Transaction),
          useValue: {
            createQueryBuilder: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            update: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TransactionHistoryService>(TransactionHistoryService);
    repository = module.get<Repository<Transaction>>(getRepositoryToken(Transaction));
  });

  describe("getTransactionHistory", () => {
    it("should return paginated transactions", async () => {
      const transactions = [mockTransaction(), mockTransaction({ id: "tx-2" })];
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(2),
        getMany: jest.fn().mockResolvedValue(transactions),
      };

      jest.spyOn(repository, "createQueryBuilder").mockReturnValue(queryBuilder as any);

      const result = await service.getTransactionHistory(
        "portfolio-1",
        "user-1",
        { page: 1, limit: 20 },
      );

      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.transactions).toHaveLength(2);
    });

    it("should filter by transaction type", async () => {
      const transactions = [mockTransaction({ type: TransactionType.BUY })];
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
        getMany: jest.fn().mockResolvedValue(transactions),
      };

      jest.spyOn(repository, "createQueryBuilder").mockReturnValue(queryBuilder as any);

      const result = await service.getTransactionHistory(
        "portfolio-1",
        "user-1",
        { type: TransactionType.BUY },
      );

      expect(result.transactions[0].type).toBe(TransactionType.BUY);
    });

    it("should filter by ticker", async () => {
      const transactions = [mockTransaction({ ticker: "MSFT" })];
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
        getMany: jest.fn().mockResolvedValue(transactions),
      };

      jest.spyOn(repository, "createQueryBuilder").mockReturnValue(queryBuilder as any);

      const result = await service.getTransactionHistory(
        "portfolio-1",
        "user-1",
        { ticker: "MSFT" },
      );

      expect(result.transactions[0].ticker).toBe("MSFT");
    });

    it("should filter by date range", async () => {
      const transactions = [mockTransaction()];
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
        getMany: jest.fn().mockResolvedValue(transactions),
      };

      jest.spyOn(repository, "createQueryBuilder").mockReturnValue(queryBuilder as any);

      const result = await service.getTransactionHistory(
        "portfolio-1",
        "user-1",
        {
          startDate: "2024-01-01",
          endDate: "2024-01-31",
        },
      );

      expect(result.transactions).toHaveLength(1);
    });

    it("should throw error if start date is after end date", async () => {
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
        getMany: jest.fn().mockResolvedValue([]),
      };

      jest.spyOn(repository, "createQueryBuilder").mockReturnValue(queryBuilder as any);

      await expect(
        service.getTransactionHistory("portfolio-1", "user-1", {
          startDate: "2024-01-31",
          endDate: "2024-01-01",
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("getTransaction", () => {
    it("should return a single transaction", async () => {
      const tx = mockTransaction();
      jest.spyOn(repository, "findOne").mockResolvedValue(tx);

      const result = await service.getTransaction("tx-1", "portfolio-1", "user-1");

      expect(result.id).toBe("tx-1");
      expect(repository.findOne).toHaveBeenCalledWith({
        where: {
          id: "tx-1",
          portfolioId: "portfolio-1",
          userId: "user-1",
        },
      });
    });

    it("should throw NotFoundException if transaction not found", async () => {
      jest.spyOn(repository, "findOne").mockResolvedValue(null);

      await expect(
        service.getTransaction("tx-1", "portfolio-1", "user-1"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("calculateCostBasis", () => {
    it("should calculate cost basis for a ticker", async () => {
      const tx1 = mockTransaction({
        ticker: "AAPL",
        quantity: 10,
        price: 150,
        fees: 10,
        type: TransactionType.BUY,
      });
      const tx2 = mockTransaction({
        id: "tx-2",
        ticker: "AAPL",
        quantity: -5,
        price: 160,
        fees: 5,
        type: TransactionType.SELL,
      });

      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([tx1, tx2]),
      };

      jest.spyOn(repository, "createQueryBuilder").mockReturnValue(queryBuilder as any);

      const result = await service.calculateCostBasis(
        "portfolio-1",
        "user-1",
        "AAPL",
      );

      expect(result.ticker).toBe("AAPL");
      expect(result.totalQuantity).toBe(5);
      expect(result.lastTransactionDate).toEqual(tx2.transactionDate);
    });

    it("should throw NotFoundException if no transactions found", async () => {
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      jest.spyOn(repository, "createQueryBuilder").mockReturnValue(queryBuilder as any);

      await expect(
        service.calculateCostBasis("portfolio-1", "user-1", "AAPL"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("exportTransactionsAsCSV", () => {
    it("should export transactions as CSV", async () => {
      const transactions = [mockTransaction()];
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
        getMany: jest.fn().mockResolvedValue(transactions),
      };

      jest.spyOn(repository, "createQueryBuilder").mockReturnValue(queryBuilder as any);

      const csv = await service.exportTransactionsAsCSV(
        "portfolio-1",
        "user-1",
        {},
      );

      expect(csv).toContain("Transaction ID");
      expect(csv).toContain("Date");
      expect(csv).toContain("AAPL");
    });

    it("should return message if no transactions found", async () => {
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
        getMany: jest.fn().mockResolvedValue([]),
      };

      jest.spyOn(repository, "createQueryBuilder").mockReturnValue(queryBuilder as any);

      const result = await service.exportTransactionsAsCSV(
        "portfolio-1",
        "user-1",
        {},
      );

      expect(result).toBe("No transactions found");
    });
  });

  describe("exportTransactionsAsJSON", () => {
    it("should export transactions as JSON", async () => {
      const transactions = [mockTransaction()];
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
        getMany: jest.fn().mockResolvedValue(transactions),
      };

      jest.spyOn(repository, "createQueryBuilder").mockReturnValue(queryBuilder as any);

      const result = await service.exportTransactionsAsJSON(
        "portfolio-1",
        "user-1",
        {},
      );

      expect(result).toHaveProperty("exportDate");
      expect(result).toHaveProperty("portfolioId");
      expect(result).toHaveProperty("totalTransactions");
      expect(result).toHaveProperty("transactions");
    });
  });

  describe("archiveTransaction", () => {
    it("should archive a transaction", async () => {
      const tx = mockTransaction();
      jest.spyOn(repository, "findOne").mockResolvedValue(tx);
      jest.spyOn(repository, "save").mockResolvedValue(tx);

      await service.archiveTransaction("tx-1", "portfolio-1", "user-1");

      expect(repository.save).toHaveBeenCalled();
    });

    it("should throw NotFoundException if transaction not found", async () => {
      jest.spyOn(repository, "findOne").mockResolvedValue(null);

      await expect(
        service.archiveTransaction("tx-1", "portfolio-1", "user-1"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("getTransactionStats", () => {
    it("should return transaction statistics", async () => {
      const transactions = [
        mockTransaction({ type: TransactionType.BUY, totalValue: 1500 }),
        mockTransaction({
          id: "tx-2",
          type: TransactionType.SELL,
          quantity: -5,
          totalValue: 800,
        }),
      ];

      jest.spyOn(repository, "find").mockResolvedValue(transactions);

      const stats = await service.getTransactionStats("portfolio-1", "user-1");

      expect(stats.totalTransactions).toBe(2);
      expect(stats.byType[TransactionType.BUY]).toBe(1);
      expect(stats.byType[TransactionType.SELL]).toBe(1);
      expect(stats.totalBuys).toBe(1500);
      expect(stats.totalSells).toBe(800);
    });
  });
});
