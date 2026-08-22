import { SmtpProvider } from "./smtp.provider";
import { Notification } from "../entities/notification.entity";

jest.mock("nodemailer");
// eslint-disable-next-line @typescript-eslint/no-var-requires
import * as nodemailer from "nodemailer";

const mockedNodemailer = nodemailer as jest.Mocked<typeof nodemailer>;

/** Minimal ConfigService double keyed by a plain values map. */
const makeConfig = (values: Record<string, any> = {}): any => ({
  get: (key: string, def?: any) =>
    values[key] !== undefined ? values[key] : def,
});

const makeNotification = (
  overrides: Partial<Notification> = {},
): Notification =>
  ({
    id: "n1",
    recipient: "user@example.com",
    subject: "Hello",
    content: "<p>Hi there</p>",
    metadata: {},
    ...overrides,
  }) as Notification;

describe("SmtpProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns success in test mode when credentials are not configured (no network)", async () => {
    const provider = new SmtpProvider(makeConfig({}));

    const result = await provider.send(makeNotification());

    expect(result.success).toBe(true);
    expect(result.messageId).toBe("test_smtp_n1");
    expect(mockedNodemailer.createTransport).not.toHaveBeenCalled();
  });

  it("sends via nodemailer and maps a successful response", async () => {
    const sendMail = jest.fn().mockResolvedValue({
      messageId: "smtp-123",
      accepted: ["user@example.com"],
      rejected: [],
      response: "250 OK",
    });
    (mockedNodemailer.createTransport as jest.Mock).mockReturnValue({
      sendMail,
    });

    const provider = new SmtpProvider(
      makeConfig({
        SMTP_USER: "apikey",
        SMTP_PASSWORD: "secret",
        EMAIL_FROM: "noreply@stellaiverse.com",
      }),
    );

    const result = await provider.send(
      makeNotification({ metadata: { renderedText: "Hi there (text)" } }),
    );

    expect(result.success).toBe(true);
    expect(result.messageId).toBe("smtp-123");
    expect(result.statusCode).toBe(200);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "noreply@stellaiverse.com",
        to: "user@example.com",
        subject: "Hello",
        html: "<p>Hi there</p>",
        text: "Hi there (text)", // prefers the pre-rendered text part
      }),
    );
  });

  it("maps a transport error to a failed response", async () => {
    const sendMail = jest
      .fn()
      .mockRejectedValue(new Error("connection refused"));
    (mockedNodemailer.createTransport as jest.Mock).mockReturnValue({
      sendMail,
    });

    const provider = new SmtpProvider(
      makeConfig({ SMTP_USER: "apikey", SMTP_PASSWORD: "secret" }),
    );

    const result = await provider.send(makeNotification());

    expect(result.success).toBe(false);
    expect(result.error).toBe("connection refused");
    expect(result.statusCode).toBe(500);
  });

  it("falls back to stripped HTML for the text part when no rendered text exists", async () => {
    const sendMail = jest.fn().mockResolvedValue({
      messageId: "smtp-xyz",
      accepted: ["user@example.com"],
      rejected: [],
      response: "250 OK",
    });
    (mockedNodemailer.createTransport as jest.Mock).mockReturnValue({
      sendMail,
    });

    const provider = new SmtpProvider(
      makeConfig({ SMTP_USER: "u", SMTP_PASSWORD: "p" }),
    );

    await provider.send(
      makeNotification({ content: "<p>Hello <b>World</b></p>", metadata: {} }),
    );

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Hello World" }),
    );
  });
});
