// Monta a requisição de workflow_dispatch pro GitHub Actions do repo
// agent-okaisites, que roda o wrangler pages project delete do slug. Esta
// function não fala com o Cloudflare direto: quem faz isso é o workflow,
// que já tem os secrets da conta Cloudflare.
const REPO = 'vhokuboz/agent-okaisites'
const WORKFLOW = 'encerrar-cliente.yml'

export function buildDispatchRequest(
  slug: string,
  token: string,
): { url: string; init: RequestInit } {
  return {
    url: `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    init: {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ ref: 'main', inputs: { slug } }),
    },
  }
}
