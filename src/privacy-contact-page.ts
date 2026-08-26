import { parsePrivacyContactEmail } from './config/privacyContact';

const email = parsePrivacyContactEmail(import.meta.env.VITE_PRIVACY_CONTACT_EMAIL);
const configured = document.querySelector<HTMLElement>('#private-contact');
const unconfigured = document.querySelector<HTMLElement>(
  '#private-contact-unconfigured',
);
const link = document.querySelector<HTMLAnchorElement>('#private-contact-link');

if (email && configured && unconfigured && link) {
  link.textContent = email;
  link.href = `mailto:${encodeURIComponent(email)}`;
  configured.hidden = false;
  unconfigured.hidden = true;
}
