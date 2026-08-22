import { Injectable, Logger } from "@nestjs/common";
import { NotificationTemplate } from "../entities/notification.enums";
import {
  NOTIFICATION_TEMPLATES,
  NotificationTemplateDefinition,
} from "../templates/notification-templates";

export interface RenderedTemplate {
  subject: string;
  html: string;
  text: string;
}

/**
 * Renders notification templates into their final `subject`, `html`, and `text`
 * parts by interpolating caller-supplied data into `{{ dotted.path }}` placeholders.
 *
 * Design notes:
 * - Dependency-free: a single regex pass, no template-engine dependency, no `eval`.
 * - XSS-safe: values interpolated into the `html` output are HTML-escaped. The
 *   template markup itself is trusted (authored in-repo); only the injected data
 *   is untrusted, which is exactly what we escape.
 * - Forgiving: a missing/undefined variable renders as an empty string rather
 *   than leaving a raw `{{token}}` or throwing.
 */
@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);

  private static readonly PLACEHOLDER = /\{\{\s*([\w.$-]+)\s*\}\}/g;

  /**
   * Render a template by name.
   * @throws Error if the template is not registered.
   */
  render(
    template: NotificationTemplate,
    data: Record<string, any> = {},
  ): RenderedTemplate {
    const definition = NOTIFICATION_TEMPLATES[template];
    if (!definition) {
      throw new Error(`Unknown notification template: ${template}`);
    }

    return {
      subject: this.interpolate(definition.subject, data, false),
      html: this.interpolate(definition.html, data, true),
      text: this.interpolate(definition.text, data, false),
    };
  }

  /** Whether a template is registered. */
  has(template: NotificationTemplate): boolean {
    return Boolean(NOTIFICATION_TEMPLATES[template]);
  }

  /** List registered templates and their documented variables (for docs/tests). */
  listTemplates(): Array<{
    template: NotificationTemplate;
    variables: string[];
  }> {
    return (Object.keys(NOTIFICATION_TEMPLATES) as NotificationTemplate[]).map(
      (template) => ({
        template,
        variables: (
          NOTIFICATION_TEMPLATES[template] as NotificationTemplateDefinition
        ).variables,
      }),
    );
  }

  private interpolate(
    source: string,
    data: Record<string, any>,
    escapeHtml: boolean,
  ): string {
    return source.replace(
      TemplateService.PLACEHOLDER,
      (_match, path: string) => {
        const value = this.resolvePath(data, path);
        if (value === undefined || value === null) {
          return "";
        }
        const stringValue =
          typeof value === "object" ? JSON.stringify(value) : String(value);
        return escapeHtml ? this.escapeHtml(stringValue) : stringValue;
      },
    );
  }

  private resolvePath(data: Record<string, any>, path: string): unknown {
    return path
      .split(".")
      .reduce<any>((acc, key) => (acc == null ? undefined : acc[key]), data);
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}
