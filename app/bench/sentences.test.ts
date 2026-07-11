import { describe, it, expect } from "vitest";
import { takeSentences } from "./sentences";

describe("takeSentences", () => {
  it("extrait une phrase complète et garde le reste", () => {
    expect(takeSentences("Bonjour. Ça va")).toEqual({
      sentences: ["Bonjour."],
      rest: " Ça va",
    });
  });

  it("ne coupe pas un décimal", () => {
    expect(takeSentences("Ajoute 1.5 mL puis mélange")).toEqual({
      sentences: [],
      rest: "Ajoute 1.5 mL puis mélange",
    });
  });

  it("gère plusieurs phrases et types de ponctuation", () => {
    expect(takeSentences("Fait ! Ensuite ? Puis.")).toEqual({
      sentences: ["Fait !", "Ensuite ?"],
      rest: " Puis.",
    });
  });

  it("n'émet pas une phrase dont la ponctuation finit pile en fin de buffer", () => {
    // Le point final peut être le début d'un décimal au prochain delta : on attend.
    expect(takeSentences("Température 37")).toEqual({
      sentences: [],
      rest: "Température 37",
    });
    expect(takeSentences("Terminé.")).toEqual({
      sentences: [],
      rest: "Terminé.",
    });
  });

  it("gère les points de suspension", () => {
    expect(takeSentences("Un instant… je vérifie")).toEqual({
      sentences: ["Un instant…"],
      rest: " je vérifie",
    });
  });
});
