from playwright.sync_api import sync_playwright


URL = "http://127.0.0.1:8000/index.html"


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        console_errors: list[str] = []
        page_errors: list[str] = []
        main_js_responses: list[tuple[int, str]] = []
        page.on(
            "console",
            lambda m: console_errors.append(m.text)
            if m.type == "error"
            else None,
        )
        page.on("pageerror", lambda e: page_errors.append(str(e)))
        page.on(
            "response",
            lambda r: main_js_responses.append((r.status, r.url))
            if r.url.endswith("/src/js/main.js") or "/src/js/main.js?" in r.url
            else None,
        )

        page.goto(URL, wait_until="networkidle", timeout=60_000)

        # Dá tempo para o bootstrap (scripts são injetados no final do body)
        page.wait_for_timeout(2000)

        # Navega para a página de correção de atenuação
        page.evaluate(
            """
            () => {
              if (typeof UI !== 'undefined' && typeof UI.navigateTo === 'function') UI.navigateTo('correcao-atenuacao');
              else {
                if (typeof Store !== 'undefined') Store.currentPage = 'correcao-atenuacao';
                document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
                document.getElementById('page-correcao-atenuacao')?.classList.add('active');
              }
              if (typeof UI !== 'undefined' && typeof UI.renderAtenuacaoDashboardPage === 'function') UI.renderAtenuacaoDashboardPage();
            }
            """
        )

        page.wait_for_selector("#page-correcao-atenuacao.active #atn2Root", timeout=20_000)
        dbg = page.evaluate(
            """
            () => ({
              hasStore: (typeof Store !== 'undefined'),
              hasUI: (typeof UI !== 'undefined'),
              hasRender: (typeof UI !== 'undefined' && typeof UI.renderAtenuacaoDashboardPage === 'function'),
              currentPage: (typeof Store !== 'undefined') ? Store.currentPage : null,
              rootLen: document.getElementById('atn2Root')?.innerHTML?.length || 0,
              hasActivitiesId: !!document.getElementById('atn2AttenuationActivities'),
            })
            """
        )
        print("DEBUG", dbg)
        if main_js_responses:
            print("MAIN_JS_RESPONSES", main_js_responses[-3:])

        # Cria muitas atividades
        created = page.evaluate(
            """
            (n) => {
              let ok = 0;
              for (let i = 0; i < n; i++) {
                const db = -(22 + (i % 10) + 0.1 * (i % 9));
                Store.addOpTask({
                  categoria: 'correcao-atenuacao',
                  titulo: `CTO-${String(i+10).padStart(2,'0')} · Caixa teste`,
                  regiao: 'Goval',
                  responsavel: 'Teste',
                  prioridade: (db < -28 ? 'critica' : db <= -26.01 ? 'alta' : db <= -24.01 ? 'media' : 'leve'),
                  status: 'Em andamento',
                  descricao: `Atenuação: ${db} dBm`,
                  atenuacaoDb: db,
                });
                ok++;
              }
              if (typeof UI !== 'undefined' && typeof UI.renderAtenuacaoDashboardPage === 'function') UI.renderAtenuacaoDashboardPage();
              return ok;
            }
            """,
            80,
        )

        page.wait_for_timeout(600)

        metrics = page.evaluate(
            """
            () => {
              const container = document.getElementById('atn2AttenuationActivities');
              const card = container?.closest('.atn2-card');
              const rows = container?.querySelectorAll('.atn2-act-row')?.length || 0;
              const sh = container?.scrollHeight || 0;
              const ch = container?.clientHeight || 0;
              const canScroll = sh > ch + 2;

              const doc = document.documentElement;
              const body = document.body;
              const overflowX = (doc.scrollWidth > doc.clientWidth + 1) || (body.scrollWidth > body.clientWidth + 1);

              const style = container ? window.getComputedStyle(container) : null;
              return {
                rows,
                scrollHeight: sh,
                clientHeight: ch,
                canScroll,
                overflowX,
                overflowY: style?.overflowY,
                maxHeight: style?.maxHeight,
                pageActive: !!document.getElementById('page-correcao-atenuacao')?.classList.contains('active'),
                cardExists: !!card,
              };
            }
            """
        )

        print("CREATED", created)
        print("METRICS", metrics)

        assert metrics["pageActive"], "page-correcao-atenuacao não está ativa"
        assert metrics["cardExists"], "card de atividades não existe"
        # O feed está limitado a 20 itens (slice(0, 20))
        assert metrics["rows"] == 20, "quantidade de itens do feed não bate com o limite esperado"
        assert metrics["canScroll"], "scroll interno não ficou ativo"
        assert metrics["overflowX"] is False, "houve overflow horizontal"

        page.screenshot(path="atn_activities_stress.png")

        if console_errors:
            print("CONSOLE_ERRORS", console_errors[:10])
        if page_errors:
            print("PAGE_ERRORS", page_errors[:10])

        browser.close()

    print("OK")


if __name__ == "__main__":
    main()

