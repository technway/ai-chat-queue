import { ArrowUpRight, Star } from "lucide-react";
import logoUrl from "../../assets/logo.png";

const repositoryUrl = "https://github.com/technway/chatgpt-message-queue";

function App() {
  return (
    <main className="flex min-h-75 flex-col overflow-hidden bg-popup-surface p-8! text-popup-text">
      <header className="flex items-center gap-3">
        <img
          className="size-11 shrink-0 rounded-full border border-popup-border object-contain"
          src={logoUrl}
          alt="ChatGPT Message Queue logo"
        />
        <div className="min-w-0 text-left">
          <h1 className="m-0 truncate text-base font-bold tracking-[-.02em]">
            Message Queue
          </h1>
        </div>
      </header>

      <section className="mt-8 text-left">
        <h2 className="m-0 text-[23px] font-bold leading-[1.12] tracking-[-.04em]">
          Queue the next steps
          <br />
          while ChatGPT is still
          <br />
          working.
        </h2>
        <ol className="m-0 mt-4 grid list-none gap-2.5 p-0 text-[13px] leading-[1.4] text-popup-muted">
          <li className="flex items-start gap-2.5">
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-popup-button text-[11px] font-bold text-white">
              1
            </span>
            <span>Open ChatGPT and start a conversation.</span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-popup-button text-[11px] font-bold text-white">
              2
            </span>
            <span>
              Press{" "}
              <kbd className="rounded-md border border-popup-border bg-white px-1.5 py-0.5 font-mono text-[11px] text-popup-kbd-text shadow-popup-key">
                Enter
              </kbd>{" "}
              while ChatGPT is generating.
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-popup-button text-[11px] font-bold text-white">
              3
            </span>
            <span>Your message waits, then sends automatically.</span>
          </li>
        </ol>
      </section>

      <a
        className="mt-4 inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-popup-button bg-popup-button px-4 text-[13px] font-semibold text-white no-underline shadow-popup-button transition duration-150 ease-out hover:-translate-y-px hover:bg-popup-button-hover hover:shadow-popup-button-hover focus-visible:outline-2 focus-visible:outline-popup-accent focus-visible:outline-offset-2"
        href={repositoryUrl}
        target="_blank"
        rel="noreferrer"
      >
        <Star
          className="size-4 fill-popup-star text-popup-star-border"
          aria-hidden="true"
        />
        Star on GitHub
        <ArrowUpRight className="size-3.5 text-popup-icon" aria-hidden="true" />
      </a>
    </main>
  );
}

export default App;
