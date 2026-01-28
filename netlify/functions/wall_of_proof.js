// netlify/functions/wall_of_proof.js
// Handles saving and retrieving Wall of Proof submissions

const { getStore } = require("@netlify/blobs");

const CATEGORIES = {
  creative: {
    label: "Creative Work",
    icon: "🎨",
    types: ["Contract", "Portfolio", "Design", "Music/Audio", "Writing", "Photography", "Other"]
  },
  legal: {
    label: "Legal Document",
    icon: "⚖️",
    types: ["Agreement", "NDA", "Will/Estate", "Evidence", "Court Filing", "Other"]
  },
  business: {
    label: "Business Record",
    icon: "💼",
    types: ["Invoice", "Proposal", "Report", "Email/Communication", "Financial", "Other"]
  },
  personal: {
    label: "Personal File",
    icon: "🏠",
    types: ["Photo", "Video", "Receipt", "Certificate", "Home Inventory", "Other"]
  },
  other: {
    label: "Other",
    icon: "📄",
    types: ["Other"]
  }
};

exports.handler = async (event, context) => {
  const store = getStore({
    name: "wall-of-proof",
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_BLOBS_TOKEN,
  });

  // GET - Retrieve recent submissions
  if (event.httpMethod === "GET") {
    try {
      // Get the submissions list
      const listData = await store.get("submissions-list", { type: "json" });
      const submissions = listData || [];
      
      // Return last 50 submissions (most recent first)
      const recent = submissions.slice(-50).reverse();
      
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, max-age=0"
        },
        body: JSON.stringify({
          ok: true,
          submissions: recent,
          categories: CATEGORIES
        })
      };
    } catch (err) {
      console.error("Error fetching wall of proof:", err);
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: true, submissions: [], categories: CATEGORIES })
      };
    }
  }

  // POST - Save a new submission
  if (event.httpMethod === "POST") {
    try {
      const body = JSON.parse(event.body || "{}");
      const { category, type, description } = body;

      // Validate
      if (!category || !CATEGORIES[category]) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ok: false, error: "Invalid category" })
        };
      }

      if (!type || !CATEGORIES[category].types.includes(type)) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ok: false, error: "Invalid type" })
        };
      }

      // Sanitize description (max 100 chars, no HTML)
      const cleanDescription = (description || "")
        .replace(/<[^>]*>/g, "")
        .replace(/[<>"'&]/g, "")
        .trim()
        .slice(0, 100);

      // Create submission
      const submission = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        category,
        categoryLabel: CATEGORIES[category].label,
        categoryIcon: CATEGORIES[category].icon,
        type,
        description: cleanDescription || null,
        timestamp: new Date().toISOString()
      };

      // Get existing submissions
      let submissions = [];
      try {
        const existing = await store.get("submissions-list", { type: "json" });
        if (existing && Array.isArray(existing)) {
          submissions = existing;
        }
      } catch (e) {
        // Start fresh if no list exists
      }

      // Add new submission
      submissions.push(submission);

      // Keep only last 500 submissions
      if (submissions.length > 500) {
        submissions = submissions.slice(-500);
      }

      // Save back
      await store.setJSON("submissions-list", submissions);

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: true,
          submission,
          message: "Added to The Proof Gallery!"
        })
      };
    } catch (err) {
      console.error("Error saving submission:", err);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: err.message })
      };
    }
  }

  return {
    statusCode: 405,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: false, error: "Method not allowed" })
  };
};
