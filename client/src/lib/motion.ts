import type { Variants, Transition } from "framer-motion";

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

export const pageTransition: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

export const easeOut: Transition = { duration: 0.32, ease: [0.16, 1, 0.3, 1] };
export const easeSpring: Transition = { type: "spring", stiffness: 220, damping: 26 };

export const stagger = (delay = 0.04): Transition => ({
  staggerChildren: delay,
});
