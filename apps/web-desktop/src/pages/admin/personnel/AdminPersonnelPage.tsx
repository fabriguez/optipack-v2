import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

export default function AdminPersonnelPage() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate('/admin/personnel/postes', { replace: true });
  }, [navigate]);
  return null;
}
