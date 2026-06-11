import ContainersPage from './ContainersPage';
import ContainerDetailPage from './ContainerDetailPage';

export const routes = [
  { path: 'containers', element: <ContainersPage /> },
  { path: 'containers/:id', element: <ContainerDetailPage /> },
];
