# vintasend-liquidjs

[LiquidJS](https://liquidjs.com/) email and SMS template renderers for VintaSend.

Liquid templates cannot run arbitrary code, which makes them a good fit for templates edited
outside the codebase, such as [managed templates](https://github.com/vintasoftware/vintasend-ts#managed-templates)
stored in a database.

## Installation

```bash
npm install vintasend-liquidjs
```

## Exports

- `LiquidEmailTemplateRenderer` / `LiquidEmailTemplateRendererFactory`: renders template files.
- `LiquidInlineEmailTemplateRenderer` / `LiquidInlineEmailTemplateRendererFactory`: renders
  templates from an in-memory map.
- `LiquidSmsTemplateRenderer` / `LiquidSmsTemplateRendererFactory`: renders plain-text SMS
  messages, from files or an in-memory map.
- `LiquidTemplateRendererOptions`: the renderer options (every `LiquidOptions` field plus
  `configureEngine`).

## Rendering template files

`notification.bodyTemplate` and `notification.subjectTemplate` are paths that Liquid resolves
against `root`. Lookups that leave the roots fail, so a template key cannot read an arbitrary file.

```
templates/
  emails/
    welcome.liquid
    welcome-subject.liquid
  partials/
    footer.liquid
```

```liquid
{%- comment -%} templates/emails/welcome.liquid {%- endcomment -%}
<h1>Hello {{ firstName }}!</h1>
<p>Your appointment is on {{ appointmentDate | date: "%B %-d, %Y" }}.</p>
{% include "partials/footer.liquid" %}
```

```liquid
{%- comment -%} templates/emails/welcome-subject.liquid {%- endcomment -%}
Welcome, {{ firstName }}
```

```typescript
import { LiquidEmailTemplateRendererFactory } from 'vintasend-liquidjs';

const templateRenderer = new LiquidEmailTemplateRendererFactory<NotificationTypeConfig>().create({
  root: './templates',
});

// Then create the notification with
//   bodyTemplate: 'emails/welcome.liquid',
//   subjectTemplate: 'emails/welcome-subject.liquid',
```

Any [LiquidJS option](https://liquidjs.com/tutorials/options.html) can be passed: `root`,
`partials`, `layouts`, `extname`, `cache`, `strictVariables`, `strictFilters`, `globals`, and so
on.

### Escaping

The **body** is rendered with `outputEscape: 'escape'`, so every `{{ value }}` is HTML-escaped and
context values cannot inject markup into the email. Mark a value as trusted HTML with the `raw`
filter: `{{ trustedHtml | raw }}`. To change this, pass your own `outputEscape`.

The **subject** is plain text and is never escaped. Its whitespace, including the trailing newline
most editors add to a template file and any line breaks coming from context values, is collapsed to
single spaces.

### Custom filters and tags

The renderer creates one Liquid engine for the body and one for the subject. Register filters,
tags or plugins on both with `configureEngine`:

```typescript
const templateRenderer = new LiquidEmailTemplateRendererFactory<NotificationTypeConfig>().create({
  root: './templates',
  configureEngine: (engine) => {
    engine.registerFilter('initials', (name: string) =>
      name.split(' ').map((part) => part[0]).join(''),
    );
  },
});
```

### Untrusted templates

When templates come from users rather than from your repository, set LiquidJS's
[DoS limits](https://liquidjs.com/tutorials/dos.html) (`parseLimit`, `renderLimit`,
`memoryLimit`) and consider `strictFilters`, so a template cannot run expensive loops.

## Rendering templates from memory

For environments that can only deploy a single bundle (for example Medplum bots), use the inline
renderer with a map of template key to template source. `include`, `render` and `layout` resolve
against the same map.

```typescript
import { LiquidInlineEmailTemplateRendererFactory } from 'vintasend-liquidjs';
import templates from './compiled-templates.json';

const templateRenderer = new LiquidInlineEmailTemplateRendererFactory<NotificationTypeConfig>().create(
  templates,
  { strictVariables: true },
);
```

Rendering a key that is not in the map throws `Body template "<key>" not found in templates` (or
the subject equivalent).

### Template compilation script

The `compile-liquid-templates` CLI writes every `.liquid` file in a directory to a JSON map keyed
by POSIX relative path (`emails/welcome.liquid`), which is what the inline renderer expects:

```bash
compile-liquid-templates [input-directory] [output-file]
```

`input-directory` defaults to `./templates` and `output-file` to `compiled-templates.json`.

```json
{
  "scripts": {
    "compile-templates": "compile-liquid-templates ./templates ./src/compiled-templates.json"
  }
}
```

## Rendering SMS

`LiquidSmsTemplateRenderer` works with SMS adapters such as
[vintasend-ts-twilio](https://github.com/vintasoftware/vintasend-ts-twilio), which send the rendered
`body`. Compared with the email renderers:

- Output is **not** HTML-escaped, because an SMS is plain text: `Tom & Jerry` arrives as written.
- The subject template is optional. Without one, `subject` is an empty string.
- Leading and trailing whitespace is trimmed from the body, including the trailing newline of a
  template file. Line breaks inside the message are kept.

```liquid
{%- comment -%} templates/sms/reminder.liquid {%- endcomment -%}
Hi {{ firstName }}, your appointment is on {{ appointmentDate | date: "%b %-d" }}.
Reply STOP to opt out.
```

```typescript
import { TwilioSmsAdapterFactory } from 'vintasend-ts-twilio';
import { LiquidSmsTemplateRendererFactory } from 'vintasend-liquidjs';

const smsRenderer = new LiquidSmsTemplateRendererFactory<NotificationTypeConfig>().create({
  root: './templates',
});
const smsAdapter = new TwilioSmsAdapterFactory<NotificationTypeConfig>().create(
  smsRenderer,
  false,
  twilioConfig,
);

// Then create the notification with
//   bodyTemplate: 'sms/reminder.liquid',
//   subjectTemplate: null,
```

For templates held in memory (Medplum bots), pass the map as the `templates` option. Keys missing
from the map fail with the same `not found in templates` error as the inline email renderer:

```typescript
import templates from './compiled-templates.json';

const smsRenderer = new LiquidSmsTemplateRendererFactory<NotificationTypeConfig>().create({
  templates,
});
```

## Rendering stored template content

Every renderer implements `renderFromTemplateContent`, which renders `{ subject, body }` strings
directly. This is what `vintasend-managed-templates` calls, so any of them can render managed
templates (the SMS renderer accepts a `null` subject). Includes in that content resolve against
`root` or the template map.

## Logging

With a logger injected, the renderers log the notification id, the template key and, on failure,
the error's name. They never log the context, the rendered output or the error message. LiquidJS
errors quote the template source around the failure, and errors thrown by filters can quote
context values.

## Development

```bash
npm install
npm run build
npm test
npm run lint
```
