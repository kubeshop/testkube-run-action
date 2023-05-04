import kleur from 'kleur';

export function critical(error: any): never {
  process.stderr.write(kleur.red().bold(`Error: ${error}\n`));
  return process.exit(1);
}

export function header(str: string): void {
  process.stdout.write(kleur.magenta().bold(`⸻ ${str}\n`));
}

export function log(str: any): void {
  process.stdout.write(kleur.gray(`${str}\n`));
}
