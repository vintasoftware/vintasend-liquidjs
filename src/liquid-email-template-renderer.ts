import { Liquid, type LiquidOptions } from 'liquidjs';
import type {
  AnyNotification,
  BaseEmailTemplateRenderer,
  BaseLogger,
  BaseNotificationTypeConfig,
  EmailTemplate,
  EmailTemplateContent,
  JsonObject,
} from 'vintasend';
import { log, logError, logId, logLabel } from 'vintasend';

type TemplatePart = 'body' | 'subject';

export type LiquidTemplateRendererOptions = LiquidOptions & {
  /**
   * Called once for each Liquid engine the renderer creates (body and subject), to register custom
   * filters, tags or plugins.
   */
  configureEngine?: (engine: Liquid) => void;
};

/**
 * Renders email notifications from Liquid template files.
 *
 * `notification.bodyTemplate` and `notification.subjectTemplate` are template paths resolved by
 * Liquid against `options.root` (the working directory when unset). Liquid refuses lookups that
 * escape the roots, so a template key can never read an arbitrary file. With `options.templates`
 * they are keys into that map instead, and a key missing from it is rejected before rendering.
 *
 * The body is rendered with `outputEscape: 'escape'` unless `options.outputEscape` says otherwise,
 * so context values cannot inject markup into an HTML email; use `{{ value | raw }}` for values
 * that are trusted HTML. The subject is plain text and is never escaped; its whitespace, including
 * the trailing newline of a template file, is collapsed to single spaces.
 */
export class LiquidEmailTemplateRenderer<Config extends BaseNotificationTypeConfig>
  implements BaseEmailTemplateRenderer<Config>
{
  logger: BaseLogger | null = null;
  protected readonly rendererName: string = 'LiquidEmailTemplateRenderer';
  /** What this renderer produces, for log lines. */
  protected readonly templateKind: string = 'email';
  protected readonly subjectRequired: boolean = true;
  private readonly bodyEngine: Liquid;
  private readonly subjectEngine: Liquid;

  constructor(protected readonly options: LiquidTemplateRendererOptions = {}) {
    const { configureEngine, ...liquidOptions } = options;
    this.bodyEngine = new Liquid({ outputEscape: 'escape', ...liquidOptions });
    this.subjectEngine = new Liquid({ ...liquidOptions, outputEscape: undefined });
    configureEngine?.(this.bodyEngine);
    configureEngine?.(this.subjectEngine);
  }

  /**
   * Inject logger (called by VintaSend when logger exists)
   */
  injectLogger(logger: BaseLogger): void {
    this.logger = logger;
  }

  async render(notification: AnyNotification<Config>, context: JsonObject): Promise<EmailTemplate> {
    const { bodyTemplate, subjectTemplate } = notification;
    if (!bodyTemplate) {
      throw new Error('Body template is required');
    }
    if (!subjectTemplate && this.subjectRequired) {
      throw new Error('Subject template is required');
    }
    this.assertTemplateExists('Body', bodyTemplate);
    if (subjectTemplate) {
      this.assertTemplateExists('Subject', subjectTemplate);
    }

    this.logger?.info(
      log`[${logLabel(this.rendererName)}] Rendering ${logLabel(this.templateKind)} template for notification ${logId(notification.id)}`,
    );

    const body = await this.renderPart('body', bodyTemplate, notification, () =>
      this.bodyEngine.renderFile(bodyTemplate, context),
    );
    const subject = subjectTemplate
      ? await this.renderPart('subject', subjectTemplate, notification, () =>
          this.subjectEngine.renderFile(subjectTemplate, context),
        )
      : '';

    return { subject: normalizeSubject(subject), body: this.normalizeBody(body) };
  }

  async renderFromTemplateContent(
    notification: AnyNotification<Config>,
    templateContent: EmailTemplateContent,
    context: JsonObject,
  ): Promise<EmailTemplate> {
    const { subject: subjectContent, body: bodyContent } = templateContent;
    if (!subjectContent && this.subjectRequired) {
      throw new Error('Subject template is required');
    }

    this.logger?.info(
      log`[${logLabel(this.rendererName)}] Rendering ${logLabel(this.templateKind)} template from content for notification ${logId(notification.id)}`,
    );

    const body = await this.renderPart('body', null, notification, () =>
      this.bodyEngine.parseAndRender(bodyContent, context),
    );
    const subject = subjectContent
      ? await this.renderPart('subject', null, notification, () =>
          this.subjectEngine.parseAndRender(subjectContent, context),
        )
      : '';

    return { subject: normalizeSubject(subject), body: this.normalizeBody(body) };
  }

  protected normalizeBody(body: string): string {
    return body;
  }

  private assertTemplateExists(part: 'Body' | 'Subject', templateKey: string): void {
    const { templates } = this.options;
    if (templates && !Object.hasOwn(templates, templateKey)) {
      throw new Error(`${part} template "${templateKey}" not found in templates`);
    }
  }

  /**
   * Runs one render, logging a failure by template key and error name only: Liquid's errors quote
   * the template source around the failure, and an error thrown by a filter keeps its message,
   * which can include context values.
   */
  private async renderPart(
    part: TemplatePart,
    templateKey: string | null,
    notification: AnyNotification<Config>,
    renderTemplate: () => Promise<string>,
  ): Promise<string> {
    try {
      return await renderTemplate();
    } catch (error) {
      this.logger?.error(
        templateKey === null
          ? log`[${logLabel(this.rendererName)}] Error rendering ${logLabel(part)} template content for notification ${logId(notification.id)}: ${logError(error)}`
          : log`[${logLabel(this.rendererName)}] Error rendering ${logLabel(part)} template ${logLabel(templateKey)} for notification ${logId(notification.id)}: ${logError(error)}`,
      );
      throw error;
    }
  }
}

function normalizeSubject(subject: string): string {
  return subject.replace(/\s+/g, ' ').trim();
}

export class LiquidEmailTemplateRendererFactory<Config extends BaseNotificationTypeConfig> {
  create(options: LiquidTemplateRendererOptions = {}): LiquidEmailTemplateRenderer<Config> {
    return new LiquidEmailTemplateRenderer<Config>(options);
  }
}
