import {
  SKALA_PUBLIC_SKILL_DESCRIPTION,
  SKALA_PUBLIC_SKILL_NAME,
  getSkalaPublicSkillSha256,
} from "@/lib/agent-skill-md";
import { absoluteUrl } from "@/lib/site-config";

export const revalidate = 3600;

export async function GET() {
  const index = {
    $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    skills: [
      {
        name: SKALA_PUBLIC_SKILL_NAME,
        type: "skill-md",
        description: SKALA_PUBLIC_SKILL_DESCRIPTION,
        url: absoluteUrl(
          "/.well-known/agent-skills/skala-public-verification/SKILL.md",
        ),
        digest: getSkalaPublicSkillSha256(),
      },
    ],
  };

  return Response.json(index, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
