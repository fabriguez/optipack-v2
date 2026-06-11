import ParcelsPage from './ParcelsPage';
import ParcelDetailPage from './ParcelDetailPage';

export const routes = [
  { path: 'parcels', element: <ParcelsPage /> },
  { path: 'parcels/:id', element: <ParcelDetailPage /> },
];
