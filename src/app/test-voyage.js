// test-voyage.js
   import { VoyageAIClient } from 'voyageai';

   const voyage = new VoyageAIClient({
     apiKey: process.env.VOYAGE_API_KEY,
   });

   async function testVoyage() {
     try {
       const response = await voyage.embed({
         input: ["Hello world test"], 
         model: "voyage-3-large"
       });
       console.log("✅ VoyageAI connected successfully!");
       console.log("Embedding dimensions:", response.data[0].embedding.length);
       console.log("First few values:", response.data[0].embedding.slice(0, 5));
     } catch (error) {
       console.error("❌ VoyageAI connection failed:", error);
     }
   }

   testVoyage();