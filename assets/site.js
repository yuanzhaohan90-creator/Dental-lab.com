const menuButton = document.querySelector(".menu-toggle");
const nav = document.getElementById("primaryNav");
if (menuButton && nav) {
  menuButton.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    menuButton.setAttribute("aria-expanded", open ? "true" : "false");
  });
}

const form = document.getElementById("caseForm");
const statusBox = document.getElementById("formStatus");
const allowedExtensions = new Set(["stl", "ply", "zip", "pdf", "jpg", "jpeg", "png"]);
const maxBytes = 25 * 1024 * 1024;

function setStatus(type, html) {
  if (!statusBox) return;
  statusBox.className = `form-status show ${type}`;
  statusBox.innerHTML = html;
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (form.dataset.submitting === "true") return;

    const submitButton = form.querySelector('button[type="submit"]');
    const originalButtonText = submitButton ? submitButton.textContent : "";
    const fileInput = form.querySelector('input[type="file"]');
    const files = fileInput ? [...fileInput.files] : [];
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    const invalid = files.find((file) => !allowedExtensions.has(file.name.split(".").pop().toLowerCase()));

    if (form.website && form.website.value) {
      setStatus("error", "Submission blocked.");
      return;
    }
    if (invalid) {
      setStatus("error", "Please upload only STL, PLY, ZIP, PDF, JPG or PNG files.");
      return;
    }
    if (totalBytes > maxBytes) {
      setStatus("error", "Files are larger than 25MB. Please send a ZIP link by WhatsApp or email.");
      return;
    }

    form.dataset.submitting = "true";
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Uploading...";
    }
    setStatus("", "Uploading...");
    try {
      const response = await fetch(form.action, { method: "POST", body: new FormData(form) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || "Submission failed");
      setStatus("success", `<strong>Case received.</strong><br>Case ID: <b>${data.caseId}</b><br>Your files were uploaded successfully. Our technical team will review the submission and reply by email or WhatsApp.`);
      form.reset();
    } catch (error) {
      setStatus("error", `<strong>We could not complete the upload.</strong><br>Your files were not submitted. Please try again, or send them by WhatsApp/email.<br>WhatsApp: <a href="https://wa.me/8613714730109" target="_blank" rel="noreferrer">+86 137 1473 0109</a><br>Email: <a href="mailto:yzhdentallab@gmail.com">yzhdentallab@gmail.com</a>`);
    } finally {
      form.dataset.submitting = "false";
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
      }
    }
  });
}
