"use client";

import { useEffect } from "react";

export function ExtensionFix() {
  useEffect(() => {
    const REAL_COMPOSER_SELECTOR = "textarea.aui-composer-input";

    const fixComposerInput = () => {
      document
        .querySelectorAll<HTMLElement>(REAL_COMPOSER_SELECTOR)
        .forEach((el) => {
          const currentHeight = el.style.height;
          const hasInlineStyle20 = el.getAttribute("style")?.includes("20px");
          if (currentHeight === "20px" || hasInlineStyle20) {
            el.style.setProperty("height", "auto", "important");
            el.style.setProperty("min-height", "2.5rem", "important");
          }
        });
    };

    // Remove MPA extension's injected iframe when it appears
    const removeMpaIframe = () => {
      document.querySelectorAll("iframe[src*='mpa'], iframe[src*='oss-cn']").forEach((iframe) => {
        iframe.remove();
      });
    };

    // Remove MPA's injected textarea (transparent overlay that hijacks input)
    const removeMpaTextarea = () => {
      document.querySelectorAll("textarea").forEach((el) => {
        if (!el.classList.contains("aui-composer-input")) {
          const src = el.getAttribute("src") || el.getAttribute("data-src") || "";
          const placeholder = el.getAttribute("placeholder") || "";
          if (
            src.includes("mpa") ||
            src.includes("oss-cn") ||
            placeholder.includes("mpa") ||
            el.getAttribute("data-mpa") !== null
          ) {
            el.remove();
          }
        }
      });
    };

    // Block MPA iframe from capturing keyboard events via CSS injection
    const blockMpaOverlay = () => {
      let style = document.getElementById("mpa-blocker-style");
      if (!style) {
        style = document.createElement("style");
        style.id = "mpa-blocker-style";
        style.textContent = [
          "iframe[src*='mpa'], iframe[src*='oss-cn'] {",
          "  display: none !important;",
          "  pointer-events: none !important;",
          "}",
          "textarea:not(.aui-composer-input) {",
          "  pointer-events: none !important;",
          "  visibility: hidden !important;",
          "}",
        ].join("\n");
        document.head.appendChild(style);
      }
    };

    // Restore focus to the real composer input if MPA stole it
    const restoreComposerFocus = () => {
      const realInput = document.querySelector<HTMLElement>(REAL_COMPOSER_SELECTOR);
      if (realInput && document.activeElement && !realInput.contains(document.activeElement)) {
        // Check if focus is on something suspicious
        const active = document.activeElement as HTMLElement;
        const tagName = active.tagName.toLowerCase();
        const isInComposer = realInput.contains(active) || realInput === active;
        if (!isInComposer && (tagName === "textarea" || tagName === "input")) {
          realInput.focus();
        }
      }
    };

    fixComposerInput();
    removeMpaIframe();
    removeMpaTextarea();
    blockMpaOverlay();

    const observer = new MutationObserver((mutations) => {
      let needsComposerFix = false;
      let needsIframeRemove = false;
      let needsTextareaRemove = false;
      let needsBlockOverlay = false;

      for (const m of mutations) {
        if (m.type === "childList" && m.addedNodes.length > 0) {
          needsIframeRemove = true;
          needsTextareaRemove = true;
          needsBlockOverlay = true;
          needsComposerFix = true;
        }
        if (m.type === "attributes" && m.attributeName === "style") {
          needsComposerFix = true;
        }
        if (m.type === "childList") {
          needsComposerFix = true;
        }
      }

      if (needsComposerFix) fixComposerInput();
      if (needsIframeRemove) removeMpaIframe();
      if (needsTextareaRemove) removeMpaTextarea();
      if (needsBlockOverlay) blockMpaOverlay();
      restoreComposerFocus();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style"],
    });

    // Watch for focus changes every 500ms as a fallback
    const focusInterval = setInterval(restoreComposerFocus, 500);

    if (document.body.hasAttribute("mpa-extension-id")) {
      document.body.removeAttribute("mpa-extension-id");
    }
    const bodyObserver = new MutationObserver(() => {
      if (document.body.hasAttribute("mpa-extension-id")) {
        document.body.removeAttribute("mpa-extension-id");
      }
    });
    bodyObserver.observe(document.body, { attributes: true });

    return () => {
      observer.disconnect();
      bodyObserver.disconnect();
      clearInterval(focusInterval);
    };
  }, []);

  return null;
}
