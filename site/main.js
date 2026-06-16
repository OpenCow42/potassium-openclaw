const status = document.querySelector(".copy-status");

function showStatus(message) {
  status.textContent = message;
  status.classList.add("is-visible");
  window.clearTimeout(showStatus.timeout);
  showStatus.timeout = window.setTimeout(() => {
    status.classList.remove("is-visible");
  }, 1800);
}

async function copyText(text) {
  if (globalThis.navigator?.clipboard?.writeText) {
    try {
      await globalThis.navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall back to a temporary selection for local or restricted contexts.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  document.body.append(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();

  if (!copied) {
    throw new Error("Copy command was rejected");
  }
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest(".copy-button");
  if (!button) {
    return;
  }

  const explicitTarget = button.dataset.copyTarget
    ? document.getElementById(button.dataset.copyTarget)
    : null;
  const commandBlock = button.closest(".command-block");
  const code = commandBlock ? commandBlock.querySelector("code") : null;
  const text = explicitTarget ? explicitTarget.textContent : code?.textContent;

  if (!text) {
    showStatus("Nothing to copy");
    return;
  }

  try {
    await copyText(text.trim());
    showStatus("Copied command");
  } catch {
    showStatus("Copy failed");
  }
});
