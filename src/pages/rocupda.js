import React, { useState, useEffect, useRef, useCallback } from 'react';
// import { useNavigate } from 'react-router-dom';
import LoadingOverlay from '../components/LoadingOverlay';

import { 
  generateSimulatedData,
  calculateRocCurve, 
  calculateAUC,
  fitRocBezier,
  findOptimalPoint
} from '../utils/rocUtils';

import { 
  modelPriorsOverRoc, 
  adjustpLpUClassificationThreshold,
  calculateAreaChunk
} from '../utils/aparUtils';

// Import visualization components
import { RocPlot, UtilityPlot, DistributionPlot, AparPlot } from '../components/visualizations';

// Report generator
import ReportGenerator from '../components/ReportGenerator';
import { generatePDFReport, prepareReportData } from '../utils/reportUtils';

// Add tooltip data
const tooltipData = {
  apar: {
    tooltip_text: "Applicability Area (ApAr) represents the range of disease prevalence values where using the test is optimal.",
    link_text: "Learn more about ApAr",
    link_url: "https://pubmed.ncbi.nlm.nih.gov/38222359/"
  }
};
// Helper function to generate curve points (simplified version of Bezier curve)
// const generateCurvePoints = (fpr, tpr, numPoints = 100) => {
//   const points = [];
//   for (let i = 0; i < numPoints; i++) {
//     const x = i / (numPoints - 1);
//     // Find closest points in the original curve
//     let idx = 0;
//     while (idx < fpr.length - 1 && fpr[idx] < x) {
//       idx++;
//     }
    
//     // Interpolate
//     const x1 = fpr[Math.max(0, idx - 1)];
//     const y1 = tpr[Math.max(0, idx - 1)];
//     const x2 = fpr[idx];
//     const y2 = tpr[idx];
    
//     // Linear interpolation
//     const t = (x - x1) / (x2 - x1) || 0;
//     const y = y1 + t * (y2 - y1);
    
//     points.push([x, y]);
//   }
//   return points;
// };

const Rocupda = () => {
  // const navigate = useNavigate();

  // Loading state - only for initial page load
  const [isLoading, setIsLoading] = useState(true);

  
  // State variables
  const [dataType, setDataType] = useState('simulated');
  const [diseaseMean, setDiseaseMean] = useState(1);
  const [diseaseStd, setDiseaseStd] = useState(1);
  const [healthyMean, setHealthyMean] = useState(0);
  const [healthyStd, setHealthyStd] = useState(1);
  const [cutoff, setCutoff] = useState(0);
  const [uTP, setUTP] = useState(0.8);
  const [uFP, setUFP] = useState(0.85);
  const [uTN, setUTN] = useState(1);
  const [uFN, setUFN] = useState(0);
  const [pD, setPD] = useState(0.5);
  const [classNames, setClassNames] = useState({
    positive: 'Diseased',
    negative: 'Healthy'
  });
  
  // Data state
  const [predictions, setPredictions] = useState([]);
  const [trueLabels, setTrueLabels] = useState([]);
  const [rocData, setRocData] = useState({ 
    fpr: [], 
    tpr: [], 
    thresholds: [], 
    auc: 0, 
    curvePoints: [] ,

  });
  const [optimalCutoff, setOptimalCutoff] = useState(0.5);
  const [optimalPointFpr, setOptimalPointFpr] = useState(0);
  const [optimalPointTpr, setOptimalPointTpr] = useState(0);
  const [tprValue, setTprValue] = useState(0);
  const [fprValue, setFprValue] = useState(0);

  // Add these state variables for ApAr
  const [area, setArea] = useState(0);
  const [thresholds, setThresholds] = useState([]);
  const [pLs, setPLs] = useState([]);
  const [pUs, setPUs] = useState([]);

  
  // UI state
  const [drawMode, setDrawMode] = useState('point'); // 'point' or 'line'
  const [shapes, setShapes] = useState([]);
  const [partialAUC, setPartialAUC] = useState("Toggle line mode and select region for partial AUC.");
  const [importedFile, setImportedFile] = useState(null);
  const [isShowingApar, setIsShowingApar] = useState(false);
  const [showClassNameInputs, setShowClassNameInputs] = useState(false);
  const [positiveClassName, setPositiveClassName] = useState('');
  const [negativeClassName, setNegativeClassName] = useState('');
  
  // Refs
  const fileInputRef = useRef(null);
  
  // Calculate optimal cutoff point
  const calculateOptimalCutoff = useCallback(() => {
      const {fpr, tpr, thresholds, curvePoints} = rocData;
    // console.log(curvePoints)
    const {optimalPtFpr, optimalPtTpr, optimalPointCutoff} = findOptimalPoint(uTN, uFN, uTP, uFP, pD, curvePoints, fpr, tpr, thresholds);
    // const { optimalPoint: newOptimalPoint, trueLabels: newLabels } = 
    //   calculateCutoffOptimal()
    // This function is now in RocPlot component
    // Only triggers the useEffect hook in that component
    setOptimalPointFpr(optimalPtFpr);
    setOptimalPointTpr(optimalPtTpr);
    // console.log(optimalCutoff)
    setOptimalCutoff(optimalPointCutoff);

  }, [uTP, uFP, uTN, uFN, pD, rocData]);
  
  // Recalculate optimal cutoff when utilities or prevalence changes
  useEffect(() => {
    if (rocData.fpr.length > 0) {
      // calculateOptimalCutoff();
      calculateOptimalCutoff();
    }
  }, [rocData, calculateOptimalCutoff]);

  // Handle loading overlay click
  const handleLoadingClick = () => {
    setIsLoading(false);
  };
  
  // Function to generate simulated data
  const generateData = useCallback(() => {
    const { predictions: newPredictions, trueLabels: newLabels } = 
      generateSimulatedData(diseaseMean, diseaseStd, healthyMean, healthyStd);
    
    setPredictions(newPredictions);
    setTrueLabels(newLabels);
    calculateRoc(newPredictions, newLabels);
  }, [diseaseMean, diseaseStd, healthyMean, healthyStd]);

  // Generate initial simulated data
  useEffect(() => {
    if (dataType === 'simulated') {
      generateData();
      
    }
  }, [dataType, generateData]);
  
  // Function to calculate ROC curve
  const calculateRoc = (preds, labels) => {
    const { fpr, tpr, thresholds } = calculateRocCurve(preds, labels);
    const auc = calculateAUC(fpr, tpr);
    
    // Generate bezier curve points for a smooth curve (simplified in this version)
    const curvePoints = fitRocBezier(fpr, tpr);
    
    // console.log(curvePoints)
    setRocData({ fpr, tpr, thresholds, auc, curvePoints });
    // console.log(rocData)
    

    // Set initial cutoff at 0
    handleCutoffChange(0);
    let newCutoff = 0;
    setCutoff(newCutoff);
    
    // Find index of closest threshold
    // const { thresholds, fpr, tpr } = rocData;
    let closestIndex = 0;
    let minDiff = Number.POSITIVE_INFINITY;
    
    for (let i = 0; i < thresholds.length; i++) {
      const diff = Math.abs(thresholds[i] - newCutoff);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = i;
      }
    }
    
    setTprValue(tpr[closestIndex]);
    setFprValue(fpr[closestIndex]);
    // console.log(curvePoints)
    const {optimalPtFpr, optimalPtTpr, optimalPointCutoff} = findOptimalPoint(uTN, uFN, uTP, uFP, pD, curvePoints, fpr, tpr, thresholds);
    // const { optimalPoint: newOptimalPoint, trueLabels: newLabels } = 
    //   calculateCutoffOptimal()
    // This function is now in RocPlot component
    // Only triggers the useEffect hook in that component
    setOptimalPointFpr(optimalPtFpr);
    setOptimalPointTpr(optimalPtTpr);
    // console.log("optimalpt fpr")
    // console.log(optimalPtFpr)
    setOptimalCutoff(optimalPointCutoff);
  };

  // Helper function to find the closest point to given coordinates
  const findClosestPointToCoordinates = (fpr, tpr, targetFpr, targetTpr) => {
    let closestIndex = 0;
    let minDistance = Number.POSITIVE_INFINITY;
    
    for (let i = 0; i < fpr.length; i++) {
      const distance = Math.sqrt(
        Math.pow(fpr[i] - targetFpr, 2) + 
        Math.pow(tpr[i] - targetTpr, 2)
      );
      
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = i;
      }
    }
    
    return closestIndex;
  };
  
  
  
  // Handle cutoff slider change
  const handleCutoffChange = (newCutoff) => {
    setCutoff(newCutoff);
    
    // Find index of closest threshold
    const { thresholds, fpr, tpr } = rocData;
    let closestIndex = 0;
    let minDiff = Number.POSITIVE_INFINITY;
    
    for (let i = 0; i < thresholds.length; i++) {
      const diff = Math.abs(thresholds[i] - newCutoff);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = i;
      }
    }
    
    setTprValue(tpr[closestIndex]);
    setFprValue(fpr[closestIndex]);
  };
  
  // Handle data type change
  const handleDataTypeChange = (e) => {
    const newType = e.target.value;
    setDataType(newType);
    
    if (newType === 'imported') {
      setShowClassNameInputs(true);
    } else {
      setShowClassNameInputs(false);
      setClassNames({
        positive: 'Diseased',
        negative: 'Healthy'
      });
    }
    
    // Reset shapes and partial AUC
    setShapes([]);
    setPartialAUC("Toggle line mode and select region for partial AUC.");
  };
  
  // Handle file upload
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const csvData = event.target.result;
      processCSV(csvData);
    };
    
    reader.readAsText(file);
    setImportedFile(file);
    setShowClassNameInputs(true);
  };
  
  // Process uploaded CSV
  const processCSV = (csvData) => {
    const lines = csvData.split('\n');
    const headers = lines[0].split(',');
    
    const trueLabelsIndex = headers.findIndex(header => 
      header.trim().toLowerCase() === 'true_labels');
    const predictionsIndex = headers.findIndex(header => 
      header.trim().toLowerCase() === 'predictions');
    
    if (trueLabelsIndex === -1 || predictionsIndex === -1) {
      alert('CSV must contain "true_labels" and "predictions" columns');
      return;
    }
    
    const newTrueLabels = [];
    const newPredictions = [];
    
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      
      const values = lines[i].split(',');
      
      const trueLabel = parseInt(values[trueLabelsIndex].trim());
      const prediction = parseFloat(values[predictionsIndex].trim());
      
      if (!isNaN(trueLabel) && !isNaN(prediction)) {
        newTrueLabels.push(trueLabel);
        newPredictions.push(prediction);
      }
    }
    
    if (newTrueLabels.length > 0) {
      setTrueLabels(newTrueLabels);
      setPredictions(newPredictions);
      calculateRoc(newPredictions, newTrueLabels);
    }
  };
  
  // Handle class name submission
  const handleClassNameSubmit = () => {
    if (positiveClassName && negativeClassName) {
      setClassNames({
        positive: positiveClassName,
        negative: negativeClassName
      });
      setShowClassNameInputs(false);
    }
  };
  
  // Toggle draw mode
  const toggleDrawMode = () => {
    if (drawMode === 'point') {
      setDrawMode('line');
      // setShapes([]);
    } else {
      setDrawMode('point');
      // setShapes([]);
      setPartialAUC("Toggle line mode and select region for partial AUC.");
    }
  };
  
  const generateReport = async () => {
    try {
      const dashboardState = {
        rocData,
        tprValue,
        fprValue,
        optimalPointTpr,
        optimalPointFpr,
        optimalCutoff,
        cutoff,
        uTP,
        uFP,
        uTN,
        uFN,
        pD,
        diseaseMean,
        diseaseStd,
        healthyMean,
        healthyStd,
        classNames,
        dataType
      };
  
      const reportConfig = prepareReportData(dashboardState);
      const result = await generatePDFReport(reportConfig);
      
      if (result.success) {
        alert('Report generated successfully!');
      } else {
        alert('Error: ' + result.message);
      }
    } catch (error) {
      alert('Error generating report: ' + error.message);
    }
  };
  
  const generateReportWithApar = async () => {
    try {
      const dashboardState = {
        rocData,
        tprValue,
        fprValue,
        optimalPointTpr,
        optimalPointFpr,
        optimalCutoff,
        cutoff,
        uTP,
        uFP,
        uTN,
        uFN,
        pD,
        diseaseMean,
        diseaseStd,
        healthyMean,
        healthyStd,
        classNames,
        dataType,
        // Include ApAr data
        area,
        thresholds,
        pLs,
        pUs
      };
  
      const reportConfig = prepareReportData(dashboardState);
      const result = await generatePDFReport(reportConfig);
      
      if (result.success) {
        alert('Report with ApAr generated successfully!');
      } else {
        alert('Error: ' + result.message);
      }
    } catch (error) {
      alert('Error generating ApAr report: ' + error.message);
    }
  };
  
  // Show ApAr figure
  const showAparFigure = () => {
    console.log(isShowingApar);
    setIsShowingApar(!isShowingApar);
    // navigate('/apar');
    calculateApAr(rocData);
  };

  // Add this useEffect after your existing ones
  useEffect(() => {
    if (rocData.fpr.length > 0) {
      calculateApAr(rocData);
    }
  }, [rocData, uTP, uFP, uTN, uFN, pD]);
  
  // Helper function to format display text
  const formatDisplayText = {
    cutoffText: () => `Raw Cutoff: ${cutoff.toFixed(2)}`,
    optimalCutoffText: () => {
      const HoverB = (uTN - uFP) / (uTP - uFN + 0.000000001);
      const slopeOfInterest = HoverB * (1 - pD) / pD;
      return `H/B of ${HoverB.toFixed(2)} gives a slope of ${slopeOfInterest.toFixed(2)} at the optimal cutoff ${optimalCutoff.toFixed(2)}`;
    },
    diseaseMeanText: () => `${classNames.positive} Mean: ${diseaseMean.toFixed(2)}`,
    diseaseStdText: () => `${classNames.positive} Standard Deviation: ${diseaseStd.toFixed(2)}`,
    healthyMeanText: () => `${classNames.negative} Mean: ${healthyMean.toFixed(2)}`,
    healthyStdText: () => `${classNames.negative} Standard Deviation: ${healthyStd.toFixed(2)}`,
    uTPText: () => `Utility of true positive (uTP): ${uTP.toFixed(2)}`,
    uFPText: () => `Utility of false positive (uFP): ${uFP.toFixed(2)}`,
    uTNText: () => `Utility of true negative (uTN): ${uTN.toFixed(2)}`,
    uFNText: () => `Utility of false negative (uFN): ${uFN.toFixed(2)}`,
    pDText: () => `Disease Prevalence: ${pD.toFixed(2)}`
  };
  
  // Calculate min/max for cutoff slider based on data type
  const getCutoffRange = () => {
    if (dataType === 'simulated') {
      return { min: -5, max: 5, step: 0.01, marks: [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5] };
    } else {
      // For imported data, use the range of predictions
      const min = Math.min(...predictions);
      const max = Math.max(...predictions);
      const step = (max - min) / 100;
      const marks = Array.from({ length: 11 }, (_, i) => min + (i * (max - min) / 10));
      return { min, max, step, marks };
    }
  };

  // Add this function before your existing functions
  const calculateApAr = useCallback((data) => {
    const { fpr, tpr, thresholds, curvePoints } = data;
    
    const modelTest = {
      fpr,
      tpr,
      thresholds
    };
    
    const H = uTN - uFP;
    const B = uTP - uFN + 0.000000001;
    const HoverB = H / B;
    
    const [calculatedPLs, pStars, calculatedPUs] = modelPriorsOverRoc(modelTest, uTN, uTP, uFN, uFP, 0, HoverB);
    
    const cleanedThresholds = thresholds;
    const [sortedThresholds, sortedPLs, sortedPUs] = 
      adjustpLpUClassificationThreshold(cleanedThresholds, calculatedPLs, calculatedPUs, false);
    
    const [area, largestRangePrior, largestRangePriorThresholdIndex] = 
      calculateAreaChunk(0, sortedPLs.length - 1, sortedPLs, sortedPUs, sortedThresholds);
    
    const finalArea = Math.min(Math.round(area * 1000) / 1000, 1);
    
    setThresholds(sortedThresholds);
    setPLs(sortedPLs);
    setPUs(sortedPUs);
    setArea(finalArea);
  }, [uTP, uFP, uTN, uFN]);
  
  // Render the component
  return (
    <div className="main-content">
      {isLoading && (
        <LoadingOverlay 
          text="Welcome to the home dashboard! 
                <br /><br />
                Currently undergoing optimization. Performance is dependent on your machine's compute. 
                  <br /><br />
                Click anywhere to dismiss or this message will disappear automatically."
          onHide={handleLoadingClick}
        />
      )}
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-inner">
          <div style={{ width: '98.5%', display: 'flex', flexDirection: 'column', paddingTop: '15px' }}>
            <select 
              value={dataType}
              onChange={handleDataTypeChange}
              style={{ marginBottom: '20px', padding: '8px' }}
            >
              <option value="simulated">Simulate Binormal Model</option>
              <option value="imported">Import Data</option>
            </select>
            
            {showClassNameInputs && (
              <div style={{ display: 'block', marginBottom: '20px' }}>
                <label>Enter label names:</label><br/>
                <input 
                  type="text" 
                  placeholder="Positive Class" 
                  value={positiveClassName}
                  onChange={(e) => setPositiveClassName(e.target.value)}
                  style={{ marginRight: '5px' }}
                />
                <label> and </label>
                <input 
                  type="text" 
                  placeholder="Negative Class" 
                  value={negativeClassName}
                  onChange={(e) => setNegativeClassName(e.target.value)}
                />
                <br/>
                <button 
                  onClick={handleClassNameSubmit}
                  style={{ marginTop: '10px' }}
                >
                  Submit
                </button>
              </div>
            )}
            
            {dataType === 'imported' ? (
              <div style={{ 
                width: '98.5%',
                height: '58px',
                lineHeight: '60px',
                borderWidth: '1px',
                borderStyle: 'dashed',
                borderRadius: '5px',
                textAlign: 'center',
                cursor: 'pointer',
                marginBottom: '20px'
              }}
              onClick={() => fileInputRef.current.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                />
                {importedFile ? importedFile.name : 'Drag and Drop or Click to Select Files'}
              </div>
            ) : (
              <div style={{ 
                width: '98.5%',
                height: '40px',
                lineHeight: '40px',
                borderWidth: '1px',
                borderStyle: 'dashed',
                borderRadius: '5px',
                textAlign: 'center',
                marginBottom: '10px'
              }}>
                To import data, select from dropdown
              </div>
            )}
            
            {dataType === 'simulated' && (
              <>
                <div className="slider-container">
                  <h4>{formatDisplayText.diseaseMeanText()}</h4>
                  <input
                    type="range"
                    min={-3}
                    max={3}
                    step={0.01}
                    value={diseaseMean}
                    onChange={(e) => setDiseaseMean(parseFloat(e.target.value))}
                    style={{ width: '98.5%' }}
                  />
                </div>
                
                <div className="slider-container">
                  <h4>{formatDisplayText.diseaseStdText()}</h4>
                  <input
                    type="range"
                    min={0.1}
                    max={3}
                    step={0.01}
                    value={diseaseStd}
                    onChange={(e) => setDiseaseStd(parseFloat(e.target.value))}
                    style={{ width: '98.5%' }}
                  />
                </div>
                
                <div className="slider-container">
                  <h4>{formatDisplayText.healthyMeanText()}</h4>
                  <input
                    type="range"
                    min={-3}
                    max={3}
                    step={0.01}
                    value={healthyMean}
                    onChange={(e) => setHealthyMean(parseFloat(e.target.value))}
                    style={{ width: '98.5%' }}
                  />
                </div>
                
                <div className="slider-container">
                  <h4>{formatDisplayText.healthyStdText()}</h4>
                  <input
                    type="range"
                    min={0.1}
                    max={3}
                    step={0.01}
                    value={healthyStd}
                    onChange={(e) => setHealthyStd(parseFloat(e.target.value))}
                    style={{ width: '98.5%' }}
                  />
                </div>
              </>
            )}
            
            <div className="slider-container">
              <h4>{formatDisplayText.cutoffText()}</h4>
              <input
                type="range"
                min={getCutoffRange().min}
                max={getCutoffRange().max}
                step={getCutoffRange().step}
                value={cutoff}
                onChange={(e) => handleCutoffChange(parseFloat(e.target.value))}
                style={{ width: '98.5%' }}
              />
            </div>
            
            <div className="slider-container">
              <h4>{formatDisplayText.uTPText()}</h4>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={uTP}
                onChange={(e) => setUTP(parseFloat(e.target.value))}
                style={{ width: '98.5%' }}
              />
            </div>
            
            <div className="slider-container">
              <h4>{formatDisplayText.uFPText()}</h4>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={uFP}
                onChange={(e) => setUFP(parseFloat(e.target.value))}
                style={{ width: '98.5%' }}
              />
            </div>
            
            <div className="slider-container">
              <h4>{formatDisplayText.uTNText()}</h4>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={uTN}
                onChange={(e) => setUTN(parseFloat(e.target.value))}
                style={{ width: '98.5%' }}
              />
            </div>
            
            <div className="slider-container">
              <h4>{formatDisplayText.uFNText()}</h4>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={uFN}
                onChange={(e) => setUFN(parseFloat(e.target.value))}
                style={{ width: '98.5%' }}
              />
            </div>
            
            <div className="slider-container">
              <h4>{formatDisplayText.pDText()}</h4>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={pD}
                onChange={(e) => setPD(parseFloat(e.target.value))}
                style={{ width: '98.5%' }}
              />
            </div>
            
            <h4>{formatDisplayText.optimalCutoffText()}</h4>
            
            {/* // Add this instead: */}
            <ReportGenerator
              rocData={rocData}
              tprValue={tprValue}
              fprValue={fprValue}
              optimalPointTpr={optimalPointTpr}
              optimalPointFpr={optimalPointFpr}
              optimalCutoff={optimalCutoff}
              cutoff={cutoff}
              uTP={uTP}
              uFP={uFP}
              uTN={uTN}
              uFN={uFN}
              pD={pD}
              diseaseMean={diseaseMean}
              diseaseStd={diseaseStd}
              healthyMean={healthyMean}
              healthyStd={healthyStd}
              classNames={classNames}
              dataType={dataType}
              area={area}
              thresholds={thresholds}
              pLs={pLs}
              pUs={pUs}
              predictions={predictions}
              trueLabels={trueLabels}
            />
            
            <button
              onClick={showAparFigure}
              style={{
                width: '97.5%',
                marginTop: '15px',
                marginBottom: '10px'
              }}
            >
              Show ApAr Figure
            </button>
            
            <div style={{ marginTop: 0, marginBottom: 5 }}>
              Dashboard as of: 06/08/25
            </div>
          </div>
        </div>
      </div>
      
      {/* Content Area */}
      <div className="content-area">
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
          <div style={{ width: '100%', height: '50%', display: 'flex', flexDirection: 'row', paddingLeft: '50px', paddingBottom: '10px'}}>
            {/* Distribution Plot - Full width when ApAr is hidden */}
            {!isShowingApar && (
              <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'row', marginTop: '0px' }}>
                <div style={{ width: '100%', paddingTop: '25px', marginLeft: '0px' }}>
                  {rocData.fpr.length > 0 && (
                    <DistributionPlot 
                      dataType={dataType}
                      predictions={predictions}
                      trueLabels={trueLabels}
                      classNames={classNames}
                      cutoff={cutoff}
                      optimalCutoff={optimalCutoff}
                      diseaseMean={diseaseMean}
                      diseaseStd={diseaseStd}
                      healthyMean={healthyMean}
                      healthyStd={healthyStd}
                      width='95%'
                      height='45vh'
                      xRange='8'
                    />
                  )}
                </div>
              </div>
            )}
            
            {/* Distribution Plot - Smaller width when ApAr is shown */}
            
              {isShowingApar && (
                <>
                  <div style={{ height: '100%', width: '45%', display: 'flex', flexDirection: 'row', marginTop: '0px' }}>
                    <div style={{ width: '55%', paddingTop: '25px' }}>
                      {rocData.fpr.length > 0 && (
                        <DistributionPlot 
                          dataType={dataType}
                          predictions={predictions}
                          trueLabels={trueLabels}
                          classNames={classNames}
                          cutoff={cutoff}
                          optimalCutoff={optimalCutoff}
                          diseaseMean={diseaseMean}
                          diseaseStd={diseaseStd}
                          healthyMean={healthyMean}
                          healthyStd={healthyStd}
                          xRange='5'
                        />
                      )}
                    </div>
                  </div>
                
                  <div style={{ height: '100%', width: '55%', display: 'flex', flexDirection: 'column', paddingLeft: '15px', paddingTop: '25px' }}>
                    {pLs.length > 0 && pUs.length > 0 && (
                      <AparPlot 
                        thresholds={thresholds}
                        pLs={pLs}
                        pUs={pUs}
                        cutoff={cutoff}
                        optimalPointFpr={optimalPointFpr}
                        optimalPointTpr={optimalPointTpr}
                        optimalCutoff={optimalCutoff}
                        area={dataType === 'imported' ? area : 'NA'}
                        tooltipData={tooltipData.apar}
                        width='40vw'
                        height='45vh'
                      />
                    )}
                  </div>
                </>
              )}
          </div>
          {/* ROC and Utility Plots */}
          <div style={{ width: '100%', height: '50%', display: 'flex', flexDirection: 'row', paddingLeft: '50px'}}>
            {/* ROC Plot */}
            <div style={{ height: '100%', width: '45%', display: 'flex', flexDirection: 'column'}}>
              <div style={{ height: '100%'}}>
                {rocData.fpr.length > 0 && (
                  <RocPlot 
                    rocData={rocData}
                    cutoff={cutoff || 0}
                    optimalPointFpr={optimalPointFpr || 0}
                    optimalPointTpr={optimalPointTpr || 0}
                    optimalCutoff={optimalCutoff || 0}
                    drawMode={drawMode}
                    shapes={shapes}
                    setShapes={setShapes}
                    partialAUC={partialAUC}
                    setPartialAUC={setPartialAUC}
                    tprValue={tprValue || 0}
                    fprValue={fprValue || 0}
                    onCutoffChange={handleCutoffChange}
                    toggleDrawMode={toggleDrawMode}
                    uTP={uTP}
                    uFP={uFP}
                    uTN={uTN}
                    uFN={uFN}
                    pD={pD}
                    width='35vw'
                    height='43vh'
                  />
                )}
              </div>
            </div>
            
            {/* Utility Plot */}
            <div style={{ width: '55%', display: 'flex', flexDirection: 'column' }}>
              <div>
                {rocData.fpr.length > 0 && (
                  <UtilityPlot 
                    tprValue={tprValue || 0}
                    fprValue={fprValue || 0}
                    optimalCutoff={optimalCutoff || 0}
                    optimalTpr={optimalPointTpr || 0}
                    optimalFpr={optimalPointFpr || 0}
                    uTP={uTP}
                    uFP={uFP}
                    uTN={uTN}
                    uFN={uFN}
                    height = '43vh'
                    width = '40vw' 
                  />
                )}
              </div>
            </div>
          </div>
        </div>
        {/* apar here  */}
      </div>
      
    </div>
  );
};

export default Rocupda;