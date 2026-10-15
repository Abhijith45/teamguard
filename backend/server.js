import "dotenv/config";
import app from "./src/app.js";
import { prisma } from "./config/prisma.js";

const port = Number(process.env.PORT ?? 5000);

const server = app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(async () => {
      await prisma.$disconnect();
    });
  });
}