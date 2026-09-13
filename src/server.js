import app from './app.js';
const port=Number(process.env.PORT||8787);
app.listen(port,()=>console.log(`Manzl Objekt OS v0.3 on http://localhost:${port}`));
