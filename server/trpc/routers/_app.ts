import { router } from "@/server/trpc/trpc";
import { centersRouter } from "./centers";
import { departmentsRouter } from "./departments";
import { itemsRouter } from "./items";
import { inventoryRouter } from "./inventory";
import { borrowsRouter } from "./borrows";
import { challansRouter } from "./challans";
import { reportsRouter } from "./reports";
import { pushRouter } from "./push";
import { usersRouter } from "./users";

export const appRouter = router({
  centers: centersRouter,
  departments: departmentsRouter,
  items: itemsRouter,
  inventory: inventoryRouter,
  borrows: borrowsRouter,
  challans: challansRouter,
  reports: reportsRouter,
  push: pushRouter,
  users: usersRouter,
});

export type AppRouter = typeof appRouter;
