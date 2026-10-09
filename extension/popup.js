"use strict";
const checkbox = document.getElementById("enabled");
chrome.storage.local.get({enabled: true}).then(settings => { checkbox.checked = settings.enabled; });
checkbox.addEventListener("change", () => chrome.storage.local.set({enabled: checkbox.checked}));
