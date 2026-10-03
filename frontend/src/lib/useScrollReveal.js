import { useEffect } from 'react';

export default function useScrollReveal() {
  useEffect(() => {
    const revealAll = (elements) => elements.forEach((element) => element.classList.add('is-revealed'));
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const selector = '[data-reveal]:not([data-reveal-ready])';

    if (reduceMotion || !('IntersectionObserver' in window)) {
      revealAll([...document.querySelectorAll('[data-reveal]')]);
    }

    const observer = reduceMotion || !('IntersectionObserver' in window)
      ? null
      : new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-revealed');
            observer.unobserve(entry.target);
          });
        }, { threshold: 0.12, rootMargin: '0px 0px -36px 0px' });

    const registerElements = () => {
      const elements = [...document.querySelectorAll(selector)];
      elements.forEach((element) => element.setAttribute('data-reveal-ready', 'true'));
      if (observer) elements.forEach((element) => observer.observe(element));
      else revealAll(elements);
    };

    registerElements();
    const mutations = new MutationObserver(registerElements);
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      mutations.disconnect();
      observer?.disconnect();
    };
  }, []);
}
