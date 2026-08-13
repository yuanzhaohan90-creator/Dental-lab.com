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

    setStatus("", "Submitting case details...");
    try {
      const response = await fetch(form.action, { method: "POST", body: new FormData(form) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Submission failed");
      setStatus("success", `<strong>Case received.</strong><br>Case ID: <b>${data.caseId}</b><br>${data.message}`);
      form.reset();
    } catch (error) {
      const fallbackId = `YZH-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
      setStatus("error", `<strong>The secure submission endpoint is not reachable from this environment.</strong><br>Temporary Case ID: <b>${fallbackId}</b><br>Please send the same files by WhatsApp or email.`);
    }
  });
}
