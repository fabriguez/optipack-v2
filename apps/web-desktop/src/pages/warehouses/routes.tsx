import WarehousesPage from './WarehousesPage';
import WarehouseDetailPage from './WarehouseDetailPage';
import WarehouseInventoryPage from './WarehouseInventoryPage';

export const routes = [
  { path: 'warehouses', element: <WarehousesPage /> },
  { path: 'warehouses/:id', element: <WarehouseDetailPage /> },
  { path: 'warehouses/:id/inventory/:inventoryId', element: <WarehouseInventoryPage /> },
];
