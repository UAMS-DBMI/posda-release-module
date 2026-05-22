import { Link } from "react-router-dom";

const navLinks = [
  { to: "/datasets", label: "Datasets" },
  { to: "/recordsets", label: "Recordsets" },
  { to: "/transfers", label: "Transfers" },
];

export default function Navbar() {
  return (
    <header className="navbar fixed inset-x-0 top-0 z-50">
      <nav className="content-width flex h-14 items-center justify-between px-4 sm:px-6">
        <Link to="/" className="text-sm font-bold tracking-wide text-accent">
          POSDA
        </Link>
        <ul className="flex items-center gap-5 text-sm font-medium">
          {navLinks.map((link) => (
            <li key={link.to}>
              <Link
                to={link.to}
                className="transition-colors hover:text-accent"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
