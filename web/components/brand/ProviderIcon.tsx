import { LogIn } from "lucide-react";

export function ProviderIcon({ id, className }: { id: string; className?: string }) {
  switch (id) {
    case "google":
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z" />
          <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1 .7-2.4 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
          <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z" />
          <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-5 6.7-5Z" />
        </svg>
      );
    case "github":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.9 10.9c.6.1.8-.2.8-.5v-2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.6.8.5A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z" />
        </svg>
      );
    case "microsoft-entra-id":
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#F25022" d="M2 2h9.5v9.5H2z" />
          <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" />
          <path fill="#00A4EF" d="M2 12.5h9.5V22H2z" />
          <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" />
        </svg>
      );
    case "facebook":
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#1877F2" d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7v-3.5h3.1V9.4c0-3 1.8-4.7 4.6-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9v2.2h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12Z" />
        </svg>
      );
    case "apple":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M16.4 12.7c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3-2-3.7-2-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.3-.8-1.7 0-3.2 1-4.1 2.5-1.7 3-.4 7.5 1.3 9.9.8 1.2 1.8 2.5 3 2.5 1.2 0 1.7-.8 3.1-.8 1.5 0 1.9.8 3.2.8 1.3 0 2.2-1.2 3-2.4a11 11 0 0 0 1.4-2.8c-.1 0-2.6-1-2.6-4Zm-2.5-7.3c.7-.8 1.1-2 1-3.1-1 0-2.2.6-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4Z" />
        </svg>
      );
    case "gitlab":
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#E24329" d="m12 21.4 3.3-10.2H8.7z" />
          <path fill="#FC6D26" d="M12 21.4 8.7 11.2H4l8 10.2Z" />
          <path fill="#FCA326" d="M4 11.2 3 14.3c-.1.3 0 .6.3.8l8.7 6.3z" />
          <path fill="#E24329" d="m4 11.2 4.7 0L6.7 4.9c-.1-.3-.6-.3-.7 0z" />
          <path fill="#FC6D26" d="M12 21.4 15.3 11.2H20l-8 10.2Z" />
          <path fill="#FCA326" d="m20 11.2 1 3.1c.1.3 0 .6-.3.8l-8.7 6.3z" />
          <path fill="#E24329" d="m20 11.2-4.7 0 2-6.3c.1-.3.6-.3.7 0z" />
        </svg>
      );
    case "discord":
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#5865F2" d="M20.3 4.4A19.8 19.8 0 0 0 15.5 3l-.2.5a18.3 18.3 0 0 1 4.3 1.3 16.4 16.4 0 0 0-15.2 0A18.3 18.3 0 0 1 8.7 3.5L8.5 3a19.8 19.8 0 0 0-4.8 1.4C.6 9 0 13.5.3 17.9a19.9 19.9 0 0 0 6 3l.7-1.2a13 13 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12 0l.5.4a13 13 0 0 1-2 1l.7 1.2a19.9 19.9 0 0 0 6-3c.4-5.1-.6-9.6-2.6-13.5ZM8.3 15.3c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4Zm7.4 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4Z" />
        </svg>
      );
    case "linkedin":
      return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#0A66C2" d="M20.5 2h-17A1.5 1.5 0 0 0 2 3.5v17A1.5 1.5 0 0 0 3.5 22h17a1.5 1.5 0 0 0 1.5-1.5v-17A1.5 1.5 0 0 0 20.5 2ZM8 19H5V9h3v10ZM6.5 7.7a1.7 1.7 0 1 1 0-3.5 1.7 1.7 0 0 1 0 3.5ZM19 19h-3v-5.3c0-1.3 0-2.9-1.8-2.9s-2 1.4-2 2.8V19h-3V9h2.9v1.4h.04a3.2 3.2 0 0 1 2.9-1.6c3 0 3.6 2 3.6 4.6V19Z" />
        </svg>
      );
    default:
      return <LogIn className={className} aria-hidden="true" />;
  }
}
