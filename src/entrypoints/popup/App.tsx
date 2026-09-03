import logoUrl from "../../assets/logo.png";

const repositoryUrl = "https://github.com/technway/chatgpt-message-queue";

function App() {
  return (
    <main className="popup-card">
      <img
        className="popup-logo"
        src={logoUrl}
        alt="ChatGPT Message Queue logo"
      />
      <h1>ChatGPT Message Queue</h1>
      <p>
        Queue follow-up messages while ChatGPT is generating, then send them in
        order when it is ready.
      </p>
      <a
        className="github-link"
        href={repositoryUrl}
        target="_blank"
        rel="noreferrer"
      >
        <span aria-hidden="true">★</span>
        Star on GitHub
      </a>
    </main>
  );
}

export default App;
