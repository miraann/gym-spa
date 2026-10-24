// Which statements of a migration aren't purely additive (CLAUDE.md → Working rules): the release
// flow pushes a migration to the cloud by itself only when there are none. Function bodies don't
// count (a `delete` inside a function runs later, under the function's own rules); what the
// migration itself runs does.

export interface NotAdditive {
  readonly statement: string;
  readonly why: string;
}

/** The statements a migration runs itself: comments and dollar-quoted bodies left out. */
export function topLevelStatements(sql: string): string[] {
  const withoutBodies = sql.replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, '');
  const withoutComments = withoutBodies.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  return withoutComments
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter((statement) => statement !== '');
}

/** Objects the migration creates: taking rights away from them is part of creating them. */
function createdNames(statements: readonly string[]): Set<string> {
  const names = new Set<string>();
  for (const statement of statements) {
    const object =
      /^create (?:or replace )?(?:function|table|view|type|sequence) ([a-z_]+\.[a-z_]+)/i.exec(
        statement,
      );
    if (object?.[1]) names.add(object[1].toLowerCase());
    const schema = /^create schema (?:if not exists )?([a-z_]+)/i.exec(statement);
    if (schema?.[1]) names.add(schema[1].toLowerCase());
  }
  return names;
}

function why(statement: string, created: ReadonlySet<string>): string | null {
  const lower = statement.toLowerCase();
  if (lower.startsWith('drop ')) return 'drops something';
  if (/^(delete|truncate|update) /.test(lower)) return 'changes or deletes rows';
  if (` ${lower} `.includes(' rename ')) return 'renames something';
  if (/^alter table .* drop /.test(lower)) return 'drops a column or constraint';
  if (/^alter table .* alter column .* type /.test(lower)) return 'changes a column type';
  if (lower.startsWith('revoke ')) {
    const target =
      /\bon (?:function|table|schema|all tables in schema|all functions in schema) ([a-z_]+(?:\.[a-z_]+)?)/.exec(
        lower,
      )?.[1];
    if (target === undefined || !created.has(target)) {
      return 'takes rights away from something that already exists';
    }
  }
  return null;
}

/** The statements of a migration that aren't purely additive, with why. */
export function notAdditive(sql: string): NotAdditive[] {
  const statements = topLevelStatements(sql);
  const created = createdNames(statements);
  return statements.flatMap((statement) => {
    const reason = why(statement, created);
    return reason === null ? [] : [{ statement, why: reason }];
  });
}
