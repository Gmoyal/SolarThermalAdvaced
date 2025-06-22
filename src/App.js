import React, { useState, useRef } from "react";
import { jsPDF } from "jspdf";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import "./styles.css";

const MAKTINTA_LOGO = process.env.PUBLIC_URL + "/logo-maktinta.png.png/";

const f = (n) =>
  n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

function calcApartmentDHW(apts, beds) {
  if (!apts || !beds) return 0;
  let per = 20 + (beds > 1 ? 15 : 0) + (beds > 2 ? 10 * (beds - 2) : 0);
  return apts * per;
}

function calcPanelArea(panel, roof) {
  const isFlat = roof === "flat";
  if (panel === "4x10") return isFlat ? 32 : 40;
  if (panel === "4x8") return isFlat ? 26 : 32;
  return 40;
}

function calcPanelBTU(panel, orient) {
  let base = panel === "4x10" ? 40000 : 32000;
  if (orient === "south") return base;
  if (orient === "west" || orient === "east") return base * 0.8;
  return base * 0.5;
}

function storageGallons(btu) {
  return Math.round((btu / 40000) * 50);
}

function toUSD(val) {
  return "$" + val.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function co2ToTrees(co2) {
  return Math.round(co2 / 0.0227);
}

export default function App() {
  // Inputs
  const [address, setAddress] = useState("");
  const [dhwMethod, setDhwMethod] = useState("apartment");
  const [dhw, setDhw] = useState(0);
  const [apts, setApts] = useState(0);
  const [beds, setBeds] = useState(0);
  const [gasCost, setGasCost] = useState(2.0);
  const [roofSqft, setRoofSqft] = useState(800);
  const [roofType, setRoofType] = useState("flat");
  const [roofOrient, setRoofOrient] = useState("south");
  const [panelSize, setPanelSize] = useState("4x10");
  const [panelAuto, setPanelAuto] = useState(true);
  const [dhwPct, setDhwPct] = useState(75);
  const [incentiveLocal, setIncentiveLocal] = useState(false);
  const [localIncentiveType, setLocalIncentiveType] = useState("percent");
  const [localIncentive, setLocalIncentive] = useState(0);

  const inputRef = useRef(null);

  // 1. DHW
  const dailyDHW =
    dhwMethod === "apartment" ? calcApartmentDHW(apts, beds) : Number(dhw);
  const dailyBTU = dailyDHW * 8.33 * 90; // temp rise fixed at 90°F

  // 2. Target DHW
  const targetBTU = dailyBTU * (dhwPct / 100);

  // 3. Panel selection
  let panelOpt = panelAuto
    ? roofSqft / calcPanelArea("4x10", roofType) >=
      Math.ceil(targetBTU / calcPanelBTU("4x10", roofOrient))
      ? "4x10"
      : "4x8"
    : panelSize;

  // 4. Panel BTU & area
  const panelBTU = calcPanelBTU(panelOpt, roofOrient);

  // 5. Number of panels
  const panelsNeeded = Math.ceil(targetBTU / panelBTU);
  const maxPanels = Math.floor(roofSqft / calcPanelArea(panelOpt, roofType));
  const panelsUsed = Math.min(panelsNeeded, maxPanels);

  // 6. Actual system BTU/day
  const actualSysBTU = panelsUsed * panelBTU;
  const actualCoverage =
    dailyBTU === 0 ? 0 : Math.round((actualSysBTU / dailyBTU) * 100);

  // 7. Storage size
  const storage = storageGallons(actualSysBTU);

  // 8. Materials ("directs")
  const panelCost = 1600;
  const storageCost = 25;
  const controlsCost = 5000;
  const rackingCost = 350;
  const pipingCost = 950;

  const panelsSubtotal = panelsUsed * panelCost;
  const storageSubtotal = storage * storageCost;
  const controlsSubtotal = controlsCost;
  const rackingSubtotal = panelsUsed * rackingCost;
  const pipingSubtotal = panelsUsed * pipingCost;

  const directsSubtotal =
    panelsSubtotal +
    storageSubtotal +
    controlsSubtotal +
    rackingSubtotal +
    pipingSubtotal;

  // 9. Total cost structure (Materials/Labor/Profit)
  const totalCost = directsSubtotal / 0.3; // since directs are 30% of total
  const materials = totalCost * 0.3;
  const labor = totalCost * 0.3; // labor includes soft cost
  const profit = totalCost * 0.4;

  // 10. Incentives
  const fedITC = 0.3 * totalCost;
  const taxRate = 0.21; // Federal corporate tax
  const depreciationBase = totalCost - fedITC;
  const depreciationBenefit = depreciationBase * taxRate;

  let locIncent = 0;
  if (incentiveLocal && localIncentive) {
    if (localIncentiveType === "percent") {
      locIncent = totalCost * (Number(localIncentive) / 100);
    } else {
      locIncent = Number(localIncentive);
    }
  }
  const totalIncent = fedITC + depreciationBenefit + locIncent;
  const netCost = totalCost - totalIncent;

  // 11. Annual Savings (first year, no escalation)
  const annTherms = (actualSysBTU * 365) / (100000 * 0.75);
  const firstYearSavings = annTherms * gasCost;

  // Escalate gas price by 3% per year for ROI/cash flow
  const escalate = (base, rate, years) => {
    let arr = [];
    let sum = 0;
    for (let i = 1; i <= years; ++i) {
      const val = base * Math.pow(1 + rate, i - 1);
      arr.push(val);
      sum += val;
    }
    return { arr, sum };
  };

  const { arr: annualSavingsArray, sum: total20yrSavings } = escalate(
    firstYearSavings,
    0.03,
    20
  );
  const { arr: annualSavingsArray25, sum: total25yrSavings } = escalate(
    firstYearSavings,
    0.03,
    25
  );

  // Payback (years): Add up escalated annual savings until they exceed netCost
  let payback = null,
    cumulative = 0;
  for (let i = 0; i < annualSavingsArray.length; ++i) {
    cumulative += annualSavingsArray[i];
    if (!payback && cumulative >= netCost) payback = i + 1;
  }

  // ROI
  const roi20 = ((total20yrSavings - netCost) / netCost) * 100;

  // Cash Flow Data (for chart)
  const cashFlowData = [];
  let cum = -netCost;
  for (let i = 0; i <= 25; ++i) {
    if (i > 0) cum += annualSavingsArray25[i - 1];
    cashFlowData.push({ year: i, Cumulative: Math.round(cum) });
  }

  // 13. CO2
  const annCO2 = annTherms * 0.0053;
  const annTrees = co2ToTrees(annCO2);

  // 14. Warnings
  const roofLimited = panelsUsed < panelsNeeded;
  const northWarning = roofOrient === "north";

  // PDF Export
  function exportPDF() {
    const doc = new jsPDF();
    let y = 15;
    doc.setFont("helvetica", "bold");
    doc.addImage(MAKTINTA_LOGO, "PNG", 10, y, 35, 15);
    doc.setFontSize(18);
    doc.text("Commercial Solar Thermal Estimate", 50, y + 10);
    y += 22;

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Address/ZIP: ${address}`, 10, y);
    y += 7;
    doc.text(`System: ${panelsUsed} x ${panelOpt} panels`, 10, y);
    y += 7;
    doc.text(`Storage Size: ${storage} gallons`, 10, y);
    y += 7;
    doc.text(`DHW Load: ${f(dailyDHW)} gal/day`, 10, y);
    y += 7;
    doc.text(
      `Coverage: ${actualCoverage}% (${
        roofLimited ? "Limited by roof area" : "Target"
      })`,
      10,
      y
    );
    y += 7;
    doc.text(
      `Orientation: ${roofOrient.toUpperCase()}, Roof: ${roofType}, Space: ${f(
        roofSqft
      )} sqft`,
      10,
      y
    );
    y += 10;

    doc.setFont("helvetica", "bold");
    doc.text(`Total System Cost: ${toUSD(totalCost)}`, 10, y);
    y += 8;
    doc.setFont("helvetica", "normal");

    doc.text(`Federal ITC (30%): ${toUSD(fedITC)}`, 10, y);
    y += 6;
    doc.text(`Depreciation Tax Benefit: ${toUSD(depreciationBenefit)}`, 10, y);
    y += 6;
    if (locIncent) {
      doc.text(`Local Incentive: ${toUSD(locIncent)}`, 10, y);
      y += 6;
    }
    doc.text(`Net System Cost: ${toUSD(netCost)}`, 10, y);
    y += 8;

    doc.text(
      `Annual Savings (Year 1): ${f(annTherms)} therms, ${toUSD(
        firstYearSavings
      )}`,
      10,
      y
    );
    y += 6;
    doc.text(
      `Simple Payback: ${payback ? payback.toFixed(1) : "-"} years`,
      10,
      y
    );
    y += 6;
    doc.text(`20-year ROI: ${roi20 ? roi20.toFixed(0) : "-"}%`, 10, y);
    y += 6;
    doc.text(
      `Annual CO₂ Offset: ${annCO2.toFixed(2)} tons (~${annTrees} trees)`,
      10,
      y
    );
    y += 10;

    doc.setFont("helvetica", "bold");
    doc.setTextColor(200, 0, 0);
    doc.text(
      "Disclaimer: This tool provides a preliminary estimate for informational purposes only. For a more accurate proposal, contact Maktinta Energy at 408-432-9900 or visit www.maktinta.com.",
      10,
      y,
      { maxWidth: 180 }
    );
    doc.save("Maktinta_Solar_Thermal_Estimate.pdf");
  }

  return (
    <div className="maktinta-calc">
      <header className="maktinta-header">
        <img
          src={MAKTINTA_LOGO}
          alt="Maktinta Energy"
          className="maktinta-logo"
        />
        <div className="maktinta-header-center">
          <h1>Commercial Solar Thermal Calculator</h1>
          <div className="contact-bar">
            Tel: 408-432-9900 |{" "}
            <a href="https://www.maktinta.com" target="_blank" rel="noreferrer">
              www.maktinta.com
            </a>
          </div>
        </div>
      </header>

      <div className="maktinta-main">
        <section className="input-section" ref={inputRef}>
          <h2>Project Inputs</h2>
          <label>
            Address or ZIP
            <br />
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>

          <label>
            DHW Input Method
            <br />
            <select
              value={dhwMethod}
              onChange={(e) => setDhwMethod(e.target.value)}
            >
              <option value="apartment">Apartment Building</option>
              <option value="dhw">Total GPD (enter manually)</option>
            </select>
          </label>

          {dhwMethod === "apartment" && (
            <>
              <label>
                Number of Apartments
                <br />
                <input
                  type="number"
                  min="0"
                  value={apts}
                  onChange={(e) => setApts(Number(e.target.value))}
                />
              </label>
              <label>
                Avg. Bedrooms per Apartment
                <br />
                <input
                  type="number"
                  min="0"
                  value={beds}
                  onChange={(e) => setBeds(Number(e.target.value))}
                />
              </label>
              <div className="small-note">
                Rule: 20 gal (1st bed), 15 gal (2nd), 10 gal (each additional)
              </div>
            </>
          )}
          {dhwMethod === "dhw" && (
            <label>
              Total DHW (Gallons/day)
              <br />
              <input
                type="number"
                min="0"
                value={dhw}
                onChange={(e) => setDhw(Number(e.target.value))}
              />
            </label>
          )}

          <label>
            Natural Gas Cost ($/therm)
            <br />
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={gasCost}
              onChange={(e) => setGasCost(Number(e.target.value))}
            />
          </label>

          <label>
            Available Roof Space (sqft)
            <br />
            <input
              type="number"
              min="1"
              value={roofSqft}
              onChange={(e) => setRoofSqft(Number(e.target.value))}
            />
          </label>

          <label>
            Roof Type
            <br />
            <select
              value={roofType}
              onChange={(e) => setRoofType(e.target.value)}
            >
              <option value="composite">Composite Shingles</option>
              <option value="flat">Flat</option>
              <option value="metal">Metal</option>
              <option value="tile">Tile</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label>
            Roof Orientation
            <br />
            <select
              value={roofOrient}
              onChange={(e) => setRoofOrient(e.target.value)}
            >
              <option value="south">South (Best)</option>
              <option value="west">West</option>
              <option value="east">East</option>
              <option value="north">North (Not recommended)</option>
            </select>
          </label>

          <label>
            Panel Sizing
            <br />
            <input
              type="checkbox"
              checked={panelAuto}
              onChange={(e) => setPanelAuto(e.target.checked)}
            />{" "}
            Auto-select best fit
            {!panelAuto && (
              <select
                value={panelSize}
                onChange={(e) => setPanelSize(e.target.value)}
              >
                <option value="4x10">4'x10'</option>
                <option value="4x8">4'x8'</option>
              </select>
            )}
          </label>

          <label>
            DHW Coverage Target (%)
            <br />
            <input
              type="number"
              min="20"
              max="100"
              value={dhwPct}
              onChange={(e) => setDhwPct(Number(e.target.value))}
            />
          </label>

          <label>
            Local Incentive
            <br />
            <input
              type="checkbox"
              checked={incentiveLocal}
              onChange={(e) => setIncentiveLocal(e.target.checked)}
            />
            {incentiveLocal && (
              <>
                <select
                  value={localIncentiveType}
                  onChange={(e) => setLocalIncentiveType(e.target.value)}
                >
                  <option value="percent">%</option>
                  <option value="amount">$</option>
                </select>
                <input
                  type="number"
                  min="0"
                  value={localIncentive}
                  onChange={(e) =>
                    setLocalIncentive(e.target.value.replace(/^0+(?!\.)/, ""))
                  }
                  style={{ width: "70px", marginLeft: "5px" }}
                />
              </>
            )}
          </label>
        </section>

        <section className="results-section">
          <h2>Summary & Results</h2>
          {northWarning && (
            <div className="warning">
              Warning: North-facing roofs are not recommended for solar thermal.
            </div>
          )}
          {roofLimited && (
            <div className="warning">
              Note: Roof area limits system to {actualCoverage}% of DHW load.
            </div>
          )}
          <table className="summary-table">
            <tbody>
              <tr>
                <th>System Size</th>
                <td>
                  {panelsUsed} x {panelOpt} panels
                </td>
              </tr>
              <tr>
                <th>Storage Size</th>
                <td>{storage} gallons</td>
              </tr>
              <tr>
                <th>DHW Load (GPD)</th>
                <td>{f(dailyDHW)}</td>
              </tr>
              <tr>
                <th>Coverage</th>
                <td>{actualCoverage}%</td>
              </tr>
              <tr>
                <th>Pre-incentive Cost</th>
                <td>{toUSD(totalCost)}</td>
              </tr>
              <tr>
                <th>Federal Incentive (ITC)</th>
                <td>{toUSD(fedITC)}</td>
              </tr>
              <tr>
                <th>Federal Depreciation (100% Year 1)</th>
                <td>{toUSD(depreciationBenefit)}</td>
              </tr>
              {locIncent > 0 && (
                <tr>
                  <th>Local Incentive</th>
                  <td>{toUSD(locIncent)}</td>
                </tr>
              )}
              <tr>
                <th>Net System Cost</th>
                <td>{toUSD(netCost)}</td>
              </tr>
              <tr>
                <th>Annual Savings</th>
                <td>
                  {f(annTherms)} therms, {toUSD(firstYearSavings)}
                </td>
              </tr>
              <tr>
                <th>Simple Payback</th>
                <td>{payback ? payback.toFixed(1) : "-"} years</td>
              </tr>
              <tr>
                <th>20-Year ROI</th>
                <td>{roi20 ? roi20.toFixed(0) : "-"}%</td>
              </tr>
              <tr>
                <th>Annual CO₂ Offset</th>
                <td>
                  {annCO2.toFixed(2)} tons (~{annTrees} trees)
                </td>
              </tr>
            </tbody>
          </table>

          <h3>Cost</h3>
          <div className="summary-total-cost">
            <b>Total System Cost: {toUSD(totalCost)}</b>
          </div>

          <h3>Cumulative Cash Flow (25 Years)</h3>
          <div style={{ width: "100%", height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={cashFlowData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="year"
                  label={{
                    value: "Year",
                    position: "insideBottomRight",
                    offset: -2,
                  }}
                />
                <YAxis />
                <Tooltip formatter={(value) => "$" + value.toLocaleString()} />
                <Bar dataKey="Cumulative" fill="#3571B8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <button className="pdf-btn" onClick={exportPDF}>
            Download PDF Report
          </button>
          <button
            className="pdf-btn"
            style={{ marginLeft: 12, background: "#bbb", color: "#222" }}
            onClick={() => {
              inputRef.current?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            Edit Input
          </button>
          <div className="disclaimer">
            <b>Disclaimer:</b> This tool provides a preliminary estimate for
            informational purposes only. For a more accurate proposal, contact
            Maktinta Energy at <b>408-432-9900</b> or visit{" "}
            <a href="https://www.maktinta.com" target="_blank" rel="noreferrer">
              www.maktinta.com
            </a>
            .
          </div>
        </section>
      </div>
    </div>
  );
}
