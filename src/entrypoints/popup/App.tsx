import logoUrl from "../../assets/logo.png";

const repositoryUrl = "https://github.com/technway/chatgpt-message-queue";

function App() {
  return (
    <main className="flex min-h-[280px] flex-col items-center bg-gradient-to-b from-[#1a1b20] to-[#0f1014] px-6 pb-7 pt-[30px] text-center text-[#f5f5f5]">
      <img
        className="mb-[18px] size-16 rounded-2xl border border-[rgb(255_255_255_/_18%)]"
        src={logoUrl}
        alt="ChatGPT Message Queue logo"
      />
      <h1>ChatGPT Message Queue</h1>
      <p className="m-[11px_0_5px] max-w-[260px] text-[15px] font-semibold leading-[1.35] text-[#f5f5f5]">
        Press Enter. Keep the conversation moving.
      </p>
      <p className="m-0 mb-[22px] max-w-[260px] text-[14px] leading-[1.5] text-[#a1a1aa]">
        Queue follow-up messages while ChatGPT is generating, then send them in
        order when it is ready.
      </p>
      <a
        className="inline-flex min-h-[38px] items-center gap-[7px] rounded-[11px] border border-[#f5f5f5] bg-[#f5f5f5] px-[19px] text-[14px] font-semibold text-[#202123] no-underline shadow-[0_3px_8px_rgb(0_0_0_/_35%)] transition duration-120 ease-in-out hover:-translate-y-px hover:bg-white hover:shadow-[0_5px_12px_rgb(0_0_0_/_45%)] focus-visible:outline-2 focus-visible:outline-[#10a37f] focus-visible:outline-offset-2"
        href={repositoryUrl}
        target="_blank"
        rel="noreferrer"
      >
        <span className="text-[15px] text-[#f5c451]" aria-hidden="true">
          ★
        </span>
        Star on GitHub
      </a>
    </main>
  );
}

export default App;
