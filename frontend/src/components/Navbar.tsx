import { Link, useNavigate } from 'react-router-dom';
import { LogOut, Armchair } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    try {
      await logout();
      navigate('/login');
    } catch {
      toast.error('Logout failed. Please try again.');
    }
  }

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 font-bold text-blue-600">
          <Armchair className="h-5 w-5" />
          <span>Linkz Seats</span>
        </Link>

        {user && (
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-slate-500 sm:block">{user.email}</span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600
                         transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
