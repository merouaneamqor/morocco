/**
 * The read-only Notion surface.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  THIS FILE IS THE ONLY PLACE THE NOTION CLIENT IS CONSTRUCTED, AND IT
 *  EXPOSES READ METHODS ONLY. There is no write path in this tool, and
 *  there is not going to be one.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The whole value of the corpus is that nobody changed it quietly. An
 * automated corrector is exactly the thing that would, so the tool reports and
 * a human acts.
 *
 * `test/no-write.test.ts` greps the compiled bundle for `pages.update`,
 * `pages.create`, `blocks.children.append` and `databases.update`, and fails
 * the build if any of them appears. If you are here to add a "safe fix" mode,
 * that test is the argument against it — please read §1 of the brief first.
 */

import { Client } from '@notionhq/client';

/** The read methods this tool is permitted to call. */
export interface ReadOnlyNotion {
  queryDatabase(databaseId: string): Promise<any[]>;
  retrieveDatabase(databaseId: string): Promise<any>;
  listBlocks(blockId: string): Promise<any[]>;
}

export function createReadClient(token: string): ReadOnlyNotion {
  if (!token) {
    throw new Error(
      'NOTION_TOKEN is not set. Copy .env.example to .env and add a read-only integration token.'
    );
  }

  const notion = new Client({ auth: token });

  return {
    async queryDatabase(databaseId: string) {
      const rows: any[] = [];
      let cursor: string | undefined;
      do {
        const res = await notion.databases.query({
          database_id: databaseId,
          start_cursor: cursor,
        });
        rows.push(...res.results);
        cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
      } while (cursor);
      return rows;
    },

    async retrieveDatabase(databaseId: string) {
      return notion.databases.retrieve({ database_id: databaseId });
    },

    async listBlocks(blockId: string) {
      const blocks: any[] = [];
      let cursor: string | undefined;
      do {
        const res = await notion.blocks.children.list({
          block_id: blockId,
          start_cursor: cursor,
        });
        blocks.push(...res.results);
        cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
      } while (cursor);
      return blocks;
    },
  };
}

/**
 * Flatten a Notion property to a plain value.
 *
 * The one place to be careful is dates. `Start`/`End` on Events are real date
 * properties. `Born`/`Died` on People are deliberately rich_text and must
 * never be routed through the date branch — R06 exists to catch it if the
 * schema is ever "fixed", and this function must not pre-empt that by
 * silently coping.
 */
export function readProperty(prop: any): unknown {
  if (!prop) return null;
  switch (prop.type) {
    case 'title':
      return prop.title.map((t: any) => t.plain_text).join('');
    case 'rich_text':
      return prop.rich_text.map((t: any) => t.plain_text).join('') || null;
    case 'select':
      return prop.select?.name ?? null;
    case 'multi_select':
      return prop.multi_select.map((s: any) => s.name);
    case 'date':
      return prop.date?.start ?? null;
    case 'url':
      return prop.url ?? null;
    case 'number':
      return prop.number;
    case 'checkbox':
      return prop.checkbox;
    case 'relation':
      return prop.relation.map((r: any) => r.id);
    case 'people':
      return prop.people.map((p: any) => p.id);
    case 'last_edited_time':
      return prop.last_edited_time;
    default:
      return null;
  }
}

/** Notion blocks → Markdown, preserving the constructs the rules read. */
export function blocksToMarkdown(blocks: any[], childrenOf?: Map<string, any[]>): string {
  const rich = (arr: any[] = []): string =>
    arr
      .map((t) => {
        let s = t.plain_text ?? '';
        if (t.annotations?.code) return '`' + s + '`';
        if (t.annotations?.bold) s = `**${s}**`;
        if (t.annotations?.italic) s = `*${s}*`;
        return s;
      })
      .join('');

  const out: string[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case 'heading_1':
        out.push(`# ${rich(b.heading_1.rich_text)}`);
        break;
      case 'heading_2':
        out.push(`## ${rich(b.heading_2.rich_text)}`);
        break;
      case 'heading_3':
        out.push(`### ${rich(b.heading_3.rich_text)}`);
        break;
      case 'paragraph': {
        const t = rich(b.paragraph.rich_text);
        if (t.trim()) out.push(t);
        break;
      }
      case 'bulleted_list_item':
        out.push(`- ${rich(b.bulleted_list_item.rich_text)}`);
        break;
      case 'numbered_list_item':
        out.push(`1. ${rich(b.numbered_list_item.rich_text)}`);
        break;
      case 'quote':
      case 'callout':
        out.push(`> ${rich(b[b.type].rich_text)}`);
        break;
      case 'code':
        out.push('```\n' + rich(b.code.rich_text) + '\n```');
        break;
      case 'divider':
        out.push('---');
        break;
      case 'table': {
        const rows = childrenOf?.get(b.id) ?? [];
        for (const r of rows) {
          if (r.type !== 'table_row') continue;
          out.push('| ' + r.table_row.cells.map((c: any[]) => rich(c)).join(' | ') + ' |');
        }
        break;
      }
      default:
        break;
    }
  }
  return out.join('\n\n');
}
