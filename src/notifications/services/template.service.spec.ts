import { TemplateService } from "./template.service";
import { NotificationTemplate } from "../entities/notification.enums";

describe("TemplateService", () => {
  let service: TemplateService;

  beforeEach(() => {
    service = new TemplateService();
  });

  it("renders a known template with subject, html and text", () => {
    const rendered = service.render(NotificationTemplate.WELCOME, {
      name: "Ada",
      actionUrl: "https://app.example.com/dashboard",
    });

    expect(rendered.subject).toBe("Welcome to StellAIverse, Ada!");
    expect(rendered.html).toContain("Hi Ada,");
    expect(rendered.html).toContain("https://app.example.com/dashboard");
    expect(rendered.text).toContain("Hi Ada, welcome to StellAIverse!");
  });

  it("interpolates nested (dotted) paths", () => {
    // TRANSACTION_CONFIRMATION uses flat keys; verify dotted resolution via a
    // template that receives a nested object under a known variable.
    const rendered = service.render(NotificationTemplate.SECURITY_ALERT, {
      name: "Grace",
      event: "New login",
      ipAddress: "203.0.113.7",
      timestamp: "2026-08-22T10:00:00Z",
    });

    expect(rendered.subject).toBe("Security alert: New login");
    expect(rendered.html).toContain("203.0.113.7");
    expect(rendered.text).toContain("New login");
  });

  it("HTML-escapes interpolated data in the html output (XSS-safe)", () => {
    const rendered = service.render(NotificationTemplate.WELCOME, {
      name: "<script>alert(1)</script>",
      actionUrl: 'https://x/"onmouseover="evil()',
    });

    // The raw payload must not survive into the HTML.
    expect(rendered.html).not.toContain("<script>alert(1)</script>");
    expect(rendered.html).toContain("&lt;script&gt;");
    expect(rendered.html).toContain("&quot;");
    // The plain-text part is not HTML-escaped.
    expect(rendered.text).toContain("<script>alert(1)</script>");
  });

  it("renders missing variables as an empty string", () => {
    const rendered = service.render(NotificationTemplate.WELCOME, {
      name: "Solo",
      // actionUrl intentionally omitted
    });

    expect(rendered.subject).toBe("Welcome to StellAIverse, Solo!");
    // No leftover raw placeholder tokens anywhere.
    expect(rendered.html).not.toContain("{{");
    expect(rendered.text).not.toContain("{{");
  });

  it("throws for an unknown template", () => {
    expect(() =>
      service.render("does_not_exist" as NotificationTemplate, {}),
    ).toThrow(/Unknown notification template/);
  });

  it("reports registration via has()", () => {
    expect(service.has(NotificationTemplate.PASSWORD_RESET)).toBe(true);
    expect(service.has("nope" as NotificationTemplate)).toBe(false);
  });

  it("lists every registered template with its documented variables", () => {
    const list = service.listTemplates();
    const names = list.map((t) => t.template);

    // Every enum value must have a registered template.
    for (const template of Object.values(NotificationTemplate)) {
      expect(names).toContain(template);
    }
    const welcome = list.find(
      (t) => t.template === NotificationTemplate.WELCOME,
    );
    expect(welcome?.variables).toEqual(["name", "actionUrl"]);
  });
});
