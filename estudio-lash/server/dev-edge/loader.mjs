// Resolve os imports "npm:pacote@versao" usados na Edge Function (Deno)
// para os pacotes instalados em server/node_modules.
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('npm:')) {
    const name = specifier.slice(4).replace(/(?!^)@[^/@]+$/, '');
    if (name === 'pg') {
      return nextResolve(new URL('./pg-shim.mjs', import.meta.url).href, context);
    }
    return nextResolve(name, { ...context, parentURL: import.meta.url });
  }
  return nextResolve(specifier, context);
}
