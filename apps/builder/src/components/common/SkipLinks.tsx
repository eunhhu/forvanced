import { Component } from "solid-js";

/**
 * Skip links component for keyboard navigation accessibility.
 * Allows users to quickly jump to main content areas.
 */
export const SkipLinks: Component = () => {
  return (
    <div class="skip-links">
      <a
        href="#main-content"
        class="skip-link"
        onClick={(e) => {
          e.preventDefault();
          const main = document.getElementById("main-content");
          if (main) {
            main.focus();
            main.scrollIntoView();
          }
        }}
      >
        Skip to main content
      </a>
      <a
        href="#sidebar-nav"
        class="skip-link"
        onClick={(e) => {
          e.preventDefault();
          const nav = document.getElementById("sidebar-nav");
          if (nav) {
            const firstButton = nav.querySelector("button");
            if (firstButton) {
              firstButton.focus();
            }
          }
        }}
      >
        Skip to navigation
      </a>
    </div>
  );
};

export default SkipLinks;
