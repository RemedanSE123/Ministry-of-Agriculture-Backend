const { logAnalysis, getRecentAnalysis } = require('../models/DataAnalysisLog');

class ChartAnalysisService {
    constructor() {
        this.supportedChartTypes = [
            'bar', 'line', 'pie', 'doughnut', 'scatter', 'area', 'horizontalBar'
        ];
        
        this.dataTypePatterns = {
            numeric: /^-?\d*\.?\d+$/,
            date: /^\d{4}-\d{2}-\d{2}/,
            boolean: /^(true|false|yes|no|1|0)$/i,
            categorical: /^[A-Za-z\s]+$/,
            geographic: /(latitude|longitude|gps|location|address)/i
        };

        // AGRICULTURE-OPTIMIZED PATTERNS (High Priority)
        this.domainPatterns = {
            // Geographic/Administrative
            geographic: [/region/, /zone/, /woreda/, /kebele/, /district/, /location/, /village/i],
            
            // Land & Agriculture
            landUse: [/land.*use/, /land.*cover/, /grazing/, /forest/, /cultivation/, /farm/, /agriculture/i],
            landArea: [/area/, /hectare/, /acre/, /size/, /total.*land/, /plot.*size/i],
            cropProduction: [/yield/, /production/, /harvest/, /crop/, /cultivation/, /planting/i],
            livestock: [/livestock/, /cattle/, /goat/, /sheep/, /poultry/, /animal/i],
            
            // Economic
            economic: [/income/, /price/, /cost/, /revenue/, /market/, /sale/, /profit/i],
            
            // Environmental
            environmental: [/rainfall/, /temperature/, /soil/, /water/, /climate/, /irrigation/i],
            
            // Demographic
            demographic: [/household/, /family/, /population/, /age/, /gender/, /education/i],
            
            // Infrastructure & Assets
            infrastructure: [/equipment/, /tool/, /machine/, /vehicle/, /facility/i],
            
            // GENERAL PURPOSE PATTERNS (Medium Priority)
            measurement: [/height/, /weight/, /length/, /width/, /depth/, /volume/i],
            quality: [/quality/, /rating/, /score/, /grade/, /satisfaction/i],
            status: [/status/, /condition/, /state/, /phase/i],
            count: [/number/, /count/, /quantity/, /amount/, /total/i],
            percentage: [/percentage/, /percent/, /ratio/, /proportion/i],
            
            // SYSTEM COLUMNS (Low Priority - Filter Out)
            system: [
                /^_id$/, /^_uuid$/, /^_submission_time$/, /^_validation_status$/,
                /^_tags$/, /^_notes$/, /^_status$/, /^_attachments$/, /^formhub\/uuid$/,
                /^_xform_id_string$/, /^__version__$/, /^deviceid$/, /^simserial$/,
                /^phonenumber$/, /^meta\//, /^_geolocation/, /^start$/, /^end$/, /^today$/
            ]
        };
    }

    // SMART COLUMN FILTERING - Agriculture First, General Purpose Second
    prioritizeColumns(columns) {
        const prioritized = {
            high: [],    // Agriculture & Geographic data
            medium: [],  // General meaningful data
            low: [],     // Less important but valid data
            system: []   // System metadata (filter out)
        };

        columns.forEach(column => {
            let priority = 'low';
            let domain = 'general';

            // Check for system columns first
            if (this.domainPatterns.system.some(pattern => pattern.test(column))) {
                prioritized.system.push(column);
                return;
            }

            // Check agriculture/geographic patterns (HIGH PRIORITY)
            if (this.domainPatterns.geographic.some(pattern => pattern.test(column))) {
                priority = 'high';
                domain = 'geographic';
            } else if (this.domainPatterns.landUse.some(pattern => pattern.test(column))) {
                priority = 'high';
                domain = 'landUse';
            } else if (this.domainPatterns.landArea.some(pattern => pattern.test(column))) {
                priority = 'high';
                domain = 'landArea';
            } else if (this.domainPatterns.cropProduction.some(pattern => pattern.test(column))) {
                priority = 'high';
                domain = 'cropProduction';
            } else if (this.domainPatterns.livestock.some(pattern => pattern.test(column))) {
                priority = 'high';
                domain = 'livestock';
            }
            // Check other meaningful patterns (MEDIUM PRIORITY)
            else if (this.domainPatterns.economic.some(pattern => pattern.test(column))) {
                priority = 'medium';
                domain = 'economic';
            } else if (this.domainPatterns.environmental.some(pattern => pattern.test(column))) {
                priority = 'medium';
                domain = 'environmental';
            } else if (this.domainPatterns.demographic.some(pattern => pattern.test(column))) {
                priority = 'medium';
                domain = 'demographic';
            } else if (this.domainPatterns.infrastructure.some(pattern => pattern.test(column))) {
                priority = 'medium';
                domain = 'infrastructure';
            } else if (this.domainPatterns.measurement.some(pattern => pattern.test(column))) {
                priority = 'medium';
                domain = 'measurement';
            } else if (this.domainPatterns.quality.some(pattern => pattern.test(column))) {
                priority = 'medium';
                domain = 'quality';
            }

            prioritized[priority].push({ column, domain });
        });

        console.log(`📊 Column Prioritization: ${prioritized.high.length} high, ${prioritized.medium.length} medium, ${prioritized.low.length} low, ${prioritized.system.length} system`);
        
        return prioritized;
    }

    // Analyze project data and generate chart configurations
    async analyzeProjectData(projectUid, submissions, availableColumns) {
        const analysisId = `analysis_${projectUid}_${Date.now()}`;
        
        try {
            console.log(`🔍 Starting SMART data analysis for project ${projectUid}`);
            console.log(`📊 Analyzing ${submissions.length} submissions with ${availableColumns.length} columns`);

            const analysisResult = {
                projectUid,
                totalSubmissions: submissions.length,
                columnAnalysis: {},
                suggestedCharts: [],
                dataQuality: {},
                analysisTimestamp: new Date().toISOString(),
                domainInsights: {}
            };

            // STEP 1: SMART COLUMN PRIORITIZATION
            const prioritizedColumns = this.prioritizeColumns(availableColumns);
            
            // STEP 2: ANALYZE HIGH & MEDIUM PRIORITY COLUMNS FIRST
            const columnsToAnalyze = [
                ...prioritizedColumns.high,
                ...prioritizedColumns.medium,
                ...prioritizedColumns.low
            ];

            console.log(`🎯 Focusing on ${columnsToAnalyze.length} meaningful columns`);

            // STEP 3: ENHANCED COLUMN ANALYSIS WITH DOMAIN CONTEXT
            for (const { column, domain } of columnsToAnalyze) {
                const columnAnalysis = await this.analyzeColumn(column, submissions, domain);
                analysisResult.columnAnalysis[column] = columnAnalysis;
            }

            // STEP 4: SMART CHART GENERATION WITH STRICT LIMITS
            analysisResult.suggestedCharts = await this.generateSmartChartSuggestions(
                analysisResult.columnAnalysis, 
                submissions,
                prioritizedColumns
            );

            // STEP 5: ENHANCED DATA QUALITY ASSESSMENT
            analysisResult.dataQuality = this.assessDataQuality(analysisResult.columnAnalysis, submissions);
            
            // STEP 6: DOMAIN INSIGHTS
            analysisResult.domainInsights = this.generateDomainInsights(analysisResult.columnAnalysis, prioritizedColumns);

            // Log successful analysis
            await logAnalysis({
                project_uid: projectUid,
                analysis_type: 'smart_analysis',
                analysis_data: analysisResult,
                success: true
            });

            console.log(`✅ SMART Analysis completed. Found ${analysisResult.suggestedCharts.length} meaningful chart suggestions`);
            console.log(`🌱 Domain Insights:`, analysisResult.domainInsights);
            
            return analysisResult;

        } catch (error) {
            console.error('❌ Smart data analysis error:', error);
            
            await logAnalysis({
                project_uid: projectUid,
                analysis_type: 'smart_analysis',
                analysis_data: { error: error.message },
                success: false,
                error_message: error.message
            });

            throw error;
        }
    }

    // SMART CHART GENERATION WITH STRICT LIMITS
    async generateSmartChartSuggestions(columnAnalysis, submissions, prioritizedColumns) {
        const allSuggestions = [];
        
        // STRICT QUALITY FILTERING - Only analyze meaningful columns
        const meaningfulColumns = Object.entries(columnAnalysis)
            .filter(([col, analysis]) => 
                analysis.nonEmptyValues > 0 && 
                analysis.completeness > 0.6 && 
                analysis.relevanceScore > 0.5
            )
            .sort((a, b) => b[1].relevanceScore - a[1].relevanceScore)
            .slice(0, 20); // Only top 20 columns

        console.log(`📊 Focusing on ${meaningfulColumns.length} high-quality columns`);

        // 1. AGRICULTURE-FOCUSED CHARTS (Highest Priority)
        const agricultureCharts = this.generateAgricultureCharts(columnAnalysis, submissions, prioritizedColumns);
        allSuggestions.push(...agricultureCharts);

        // 2. KEY INSIGHT CHARTS (Medium Priority)
        const insightCharts = this.generateKeyInsightCharts(meaningfulColumns, submissions);
        allSuggestions.push(...insightCharts);

        // 3. CORRELATION CHARTS (Only strong relationships)
        const correlationCharts = this.generateStrongCorrelationCharts(meaningfulColumns, submissions);
        allSuggestions.push(...correlationCharts);

        // 4. TREND ANALYSIS CHARTS (If temporal data exists)
        const trendCharts = this.generateTrendCharts(meaningfulColumns, submissions);
        allSuggestions.push(...trendCharts);

        // DEDUPLICATION - Remove similar charts
        const uniqueSuggestions = this.deduplicateCharts(allSuggestions);

        // STRICT RANKING AND LIMITING
        const finalCharts = uniqueSuggestions
            .filter(chart => chart.relevanceScore >= 0.7) // Higher threshold
            .sort((a, b) => {
                // Priority: Agriculture > High Relevance > Domain-specific > General
                const priorityWeights = {
                    'agriculture': 4,
                    'correlation': 3,
                    'trend': 2.5,
                    'insight': 2,
                    'general': 1
                };
                
                const aWeight = priorityWeights[a.domain] || 1;
                const bWeight = priorityWeights[b.domain] || 1;
                
                if (aWeight !== bWeight) return bWeight - aWeight;
                return b.relevanceScore - a.relevanceScore;
            })
            .slice(0, 15); // STRICT LIMIT: Only 15 best charts

        console.log(`🎯 Final chart selection: ${finalCharts.length} high-quality charts`);
        
        return finalCharts;
    }

    // AGRICULTURE-SPECIFIC CHART GENERATION
    generateAgricultureCharts(columnAnalysis, submissions, prioritizedColumns) {
        const charts = [];
        
        // Get agriculture-related columns
        const geoColumns = prioritizedColumns.high.filter(c => c.domain === 'geographic').map(c => c.column);
        const landUseColumns = prioritizedColumns.high.filter(c => c.domain === 'landUse').map(c => c.column);
        const areaColumns = prioritizedColumns.high.filter(c => c.domain === 'landArea').map(c => c.column);
        const productionColumns = prioritizedColumns.high.filter(c => c.domain === 'cropProduction').map(c => c.column);
        const livestockColumns = prioritizedColumns.high.filter(c => c.domain === 'livestock').map(c => c.column);

        // REGION-BASED ANALYSIS (Very important for agriculture)
        if (geoColumns.length > 0 && (areaColumns.length > 0 || productionColumns.length > 0)) {
            const regionCol = geoColumns[0];
            
            // Land area by region - Only if we have good data
            areaColumns.slice(0, 2).forEach(areaCol => {
                if (this.isGoodForChart(columnAnalysis[areaCol])) {
                    charts.push({
                        chartName: `Land Area by ${regionCol}`,
                        chartType: 'bar',
                        config: {
                            dataSource: 'agriculture',
                            xColumn: regionCol,
                            yColumn: areaCol,
                            groupBy: regionCol
                        },
                        relevanceScore: 0.95,
                        domain: 'agriculture',
                        description: `Distribution of land area across different regions`
                    });
                }
            });

            // Production by region
            productionColumns.slice(0, 2).forEach(prodCol => {
                if (this.isGoodForChart(columnAnalysis[prodCol])) {
                    charts.push({
                        chartName: `Production by ${regionCol}`,
                        chartType: 'bar',
                        config: {
                            dataSource: 'agriculture',
                            xColumn: regionCol,
                            yColumn: prodCol,
                            groupBy: regionCol
                        },
                        relevanceScore: 0.92,
                        domain: 'agriculture'
                    });
                }
            });
        }

        // LAND USE ANALYSIS - Only if meaningful
        if (landUseColumns.length > 0) {
            const landUseCol = landUseColumns[0];
            if (this.isGoodForChart(columnAnalysis[landUseCol]) && columnAnalysis[landUseCol].uniqueValues.size <= 8) {
                charts.push({
                    chartName: `Land Use Distribution`,
                    chartType: 'pie',
                    config: {
                        dataSource: 'agriculture',
                        column: landUseCol
                    },
                    relevanceScore: 0.88,
                    domain: 'agriculture'
                });
            }
        }

        // LIVESTOCK DISTRIBUTION
        if (livestockColumns.length > 0 && geoColumns.length > 0) {
            const livestockCol = livestockColumns[0];
            const regionCol = geoColumns[0];
            if (this.isGoodForChart(columnAnalysis[livestockCol])) {
                charts.push({
                    chartName: `Livestock by Region`,
                    chartType: 'bar',
                    config: {
                        dataSource: 'agriculture',
                        xColumn: regionCol,
                        yColumn: livestockCol,
                        groupBy: regionCol
                    },
                    relevanceScore: 0.87,
                    domain: 'agriculture'
                });
            }
        }

        return charts.slice(0, 5); // Max 5 agriculture charts
    }

    // KEY INSIGHT CHARTS - Most important patterns
    generateKeyInsightCharts(meaningfulColumns, submissions) {
        const charts = [];
        const columnMap = Object.fromEntries(meaningfulColumns);

        // Find top categorical and numeric columns
        const categoricalCols = meaningfulColumns
            .filter(([col, analysis]) => analysis.dataType === 'categorical' && analysis.uniqueValues.size <= 10)
            .slice(0, 3);

        const numericCols = meaningfulColumns
            .filter(([col, analysis]) => analysis.dataType === 'numeric')
            .slice(0, 4);

        // Distribution of top categorical variables
        categoricalCols.forEach(([col, analysis]) => {
            charts.push({
                chartName: `Distribution: ${col}`,
                chartType: 'pie',
                config: {
                    dataSource: 'insight',
                    column: col
                },
                relevanceScore: 0.85,
                domain: 'insight'
            });
        });

        // Top numeric variables distribution
        numericCols.slice(0, 2).forEach(([col, analysis]) => {
            charts.push({
                chartName: `Values: ${col}`,
                chartType: 'bar',
                config: {
                    dataSource: 'insight',
                    column: col,
                    bins: 8
                },
                relevanceScore: 0.82,
                domain: 'insight'
            });
        });

        // Comparison: Numeric vs Categorical
        if (categoricalCols.length > 0 && numericCols.length > 0) {
            const catCol = categoricalCols[0][0];
            const numCol = numericCols[0][0];
            
            charts.push({
                chartName: `${numCol} by ${catCol}`,
                chartType: 'bar',
                config: {
                    dataSource: 'comparison',
                    xColumn: catCol,
                    yColumn: numCol,
                    groupBy: catCol
                },
                relevanceScore: 0.88,
                domain: 'insight'
            });
        }

        return charts.slice(0, 6); // Max 6 insight charts
    }

    // STRONG CORRELATION CHARTS - Only meaningful relationships
    generateStrongCorrelationCharts(meaningfulColumns, submissions) {
        const charts = [];
        const numericCols = meaningfulColumns
            .filter(([col, analysis]) => analysis.dataType === 'numeric')
            .slice(0, 5);

        // Find pairs with potential relationships
        for (let i = 0; i < numericCols.length; i++) {
            for (let j = i + 1; j < numericCols.length; j++) {
                const [col1, analysis1] = numericCols[i];
                const [col2, analysis2] = numericCols[j];
                
                // Check if these might be related
                let relevance = 0.6;
                
                // Boost relevance if columns seem related
                if (analysis1.domain === analysis2.domain) relevance += 0.2;
                if (col1.match(/(area|size)/i) && col2.match(/(production|yield)/i)) relevance += 0.3;
                if (col1.match(/(income|price)/i) && col2.match(/(production|yield)/i)) relevance += 0.2;
                if (col1.match(/(rainfall|water)/i) && col2.match(/(yield|production)/i)) relevance += 0.25;

                if (relevance >= 0.75) {
                    charts.push({
                        chartName: `${col1} vs ${col2}`,
                        chartType: 'scatter',
                        config: {
                            dataSource: 'correlation',
                            xColumn: col1,
                            yColumn: col2
                        },
                        relevanceScore: relevance,
                        domain: 'correlation',
                        description: `Relationship between ${col1} and ${col2}`
                    });
                }
            }
        }

        return charts.slice(0, 3); // Max 3 correlation charts
    }

    // TREND ANALYSIS CHARTS
    generateTrendCharts(meaningfulColumns, submissions) {
        const charts = [];
        
        // Find date columns
        const dateCols = meaningfulColumns.filter(([col, analysis]) => 
            analysis.dataType === 'date'
        );

        // Find numeric columns for trends
        const numericCols = meaningfulColumns.filter(([col, analysis]) => 
            analysis.dataType === 'numeric'
        );

        if (dateCols.length > 0 && numericCols.length > 0) {
            const dateCol = dateCols[0][0];
            const valueCol = numericCols[0][0];
            
            charts.push({
                chartName: `Trend: ${valueCol} Over Time`,
                chartType: 'line',
                config: {
                    dataSource: 'trend',
                    dateColumn: dateCol,
                    valueColumn: valueCol
                },
                relevanceScore: 0.9,
                domain: 'trend'
            });
        }

        return charts.slice(0, 2); // Max 2 trend charts
    }

    // DEDUPLICATE CHARTS - Remove similar ones
    deduplicateCharts(charts) {
        const uniqueCharts = [];
        const seenConfigs = new Set();

        charts.forEach(chart => {
            const configKey = `${chart.chartType}-${chart.config.xColumn}-${chart.config.yColumn}`;
            
            if (!seenConfigs.has(configKey)) {
                seenConfigs.add(configKey);
                uniqueCharts.push(chart);
            }
        });

        return uniqueCharts;
    }

    // QUALITY CHECK FOR CHARTS
    isGoodForChart(analysis) {
        if (!analysis) return false;
        
        return analysis.nonEmptyValues >= 5 && 
               analysis.completeness > 0.7 &&
               analysis.relevanceScore > 0.6;
    }

    // ENHANCED COLUMN ANALYSIS WITH DOMAIN CONTEXT
    async analyzeColumn(columnName, submissions, domain = 'general') {
        const values = submissions.map(sub => sub[columnName]).filter(val => val !== undefined && val !== null);
        const nonEmptyValues = values.filter(val => val !== '' && val !== null);
        
        const analysis = {
            columnName,
            domain,
            totalValues: values.length,
            nonEmptyValues: nonEmptyValues.length,
            emptyCount: values.length - nonEmptyValues.length,
            dataType: 'unknown',
            uniqueValues: new Set(),
            sampleValues: [],
            statistics: {},
            detectedPattern: null,
            completeness: nonEmptyValues.length / values.length,
            relevanceScore: this.calculateColumnRelevance(columnName, domain)
        };

        if (nonEmptyValues.length === 0) {
            analysis.dataType = 'empty';
            return analysis;
        }

        // Get sample values
        analysis.sampleValues = nonEmptyValues.slice(0, 5);
        analysis.uniqueValues = new Set(nonEmptyValues.map(v => String(v).toLowerCase().trim()));

        // Enhanced data type detection with domain context
        analysis.dataType = this.detectDataType(columnName, nonEmptyValues, analysis.uniqueValues, domain);
        
        // Domain-aware statistics
        analysis.statistics = this.calculateStatistics(analysis.dataType, nonEmptyValues, domain);

        // Enhanced pattern detection
        analysis.detectedPattern = this.detectColumnPattern(columnName, domain);

        return analysis;
    }

    // CALCULATE COLUMN RELEVANCE BASED ON DOMAIN
    calculateColumnRelevance(columnName, domain) {
        let baseScore = 0.5;
        
        // Boost agriculture-related columns
        if (['geographic', 'landUse', 'landArea', 'cropProduction', 'livestock'].includes(domain)) {
            baseScore += 0.3;
        }
        // Boost other meaningful domains
        else if (['economic', 'environmental', 'demographic'].includes(domain)) {
            baseScore += 0.2;
        }
        
        // Boost columns with clear patterns
        if (columnName.match(/(region|area|yield|income|production)/i)) {
            baseScore += 0.2;
        }
        
        return Math.min(baseScore, 1.0);
    }

    // ENHANCED DATA TYPE DETECTION
    detectDataType(columnName, values, uniqueValues, domain) {
        const stringValues = values.map(v => String(v).toLowerCase().trim());
        
        // Domain-specific type hints
        if (domain === 'landArea' || columnName.match(/(area|hectare|acre|size)/i)) {
            return 'numeric';
        }
        if (domain === 'geographic' || columnName.match(/(region|zone|woreda)/i)) {
            return 'categorical';
        }

        // Standard type detection
        if (this.isImageColumn(columnName, values)) return 'image';
        if (this.isDateColumn(columnName, values)) return 'date';
        if (this.isGeographicColumn(columnName, values)) return 'geographic';
        if (this.isBooleanColumn(columnName, values)) return 'boolean';
        
        const numericCount = values.filter(v => this.dataTypePatterns.numeric.test(String(v))).length;
        if (numericCount / values.length > 0.7) return 'numeric';
        
        if (uniqueValues.size <= 15 || uniqueValues.size / values.length < 0.4) {
            return 'categorical';
        }
        
        return 'text';
    }

    // KEEP ALL EXISTING HELPER METHODS
    isImageColumn(columnName, values) {
        const imagePatterns = [/_url$/, /_attachment$/, /photo/, /image/, /picture/i];
        const hasImageName = imagePatterns.some(pattern => pattern.test(columnName));
        const hasImageValues = values.some(v => 
            String(v).match(/\.(jpg|jpeg|png|gif|bmp|webp)$/i) || 
            String(v).includes('attachment') ||
            String(v).includes('download_url')
        );
        return hasImageName || hasImageValues;
    }

    isDateColumn(columnName, values) {
        const datePatterns = [/date/, /time/, /timestamp/i];
        const hasDateName = datePatterns.some(pattern => pattern.test(columnName));
        const hasDateValues = values.some(v => this.dataTypePatterns.date.test(String(v)));
        return hasDateName || hasDateValues;
    }

    isGeographicColumn(columnName, values) {
        const geoPatterns = [/gps/, /location/, /latitude/, /longitude/, /address/i];
        return geoPatterns.some(pattern => pattern.test(columnName));
    }

    isBooleanColumn(columnName, values) {
        const booleanValues = values.filter(v => this.dataTypePatterns.boolean.test(String(v))).length;
        return booleanValues / values.length > 0.7;
    }

    calculateStatistics(dataType, values, domain = 'general') {
        const stats = {};
        const numericValues = values.map(v => parseFloat(v)).filter(v => !isNaN(v));

        switch (dataType) {
            case 'numeric':
                if (numericValues.length > 0) {
                    stats.min = Math.min(...numericValues);
                    stats.max = Math.max(...numericValues);
                    stats.mean = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
                    stats.median = this.calculateMedian(numericValues);
                    stats.total = numericValues.reduce((a, b) => a + b, 0);
                    
                    // Domain-specific insights
                    if (domain === 'landArea') {
                        stats.areaCategory = this.categorizeArea(stats.mean);
                    }
                }
                break;
                
            case 'categorical':
                const valueCounts = {};
                values.forEach(v => {
                    const key = String(v).toLowerCase().trim();
                    valueCounts[key] = (valueCounts[key] || 0) + 1;
                });
                stats.valueCounts = valueCounts;
                stats.mostCommon = Object.entries(valueCounts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5);
                break;
                
            case 'date':
                const dates = values.map(v => new Date(v)).filter(d => !isNaN(d.getTime()));
                if (dates.length > 0) {
                    stats.earliest = new Date(Math.min(...dates)).toISOString();
                    stats.latest = new Date(Math.max(...dates)).toISOString();
                }
                break;
        }

        return stats;
    }

    calculateMedian(values) {
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    categorizeArea(meanArea) {
        if (meanArea < 1) return 'Small';
        if (meanArea < 5) return 'Medium';
        if (meanArea < 20) return 'Large';
        return 'Very Large';
    }

    detectColumnPattern(columnName, domain) {
        // Use domain context for better pattern detection
        if (domain !== 'general') {
            return domain;
        }

        const patterns = {
            demographic: [/age/, /gender/, /education/, /occupation/i],
            geographic: [/location/, /gps/, /address/, /region/i],
            temporal: [/date/, /time/, /year/, /month/i],
            assessment: [/rating/, /score/, /quality/, /satisfaction/i],
            measurement: [/height/, /weight/, /temperature/, /measurement/i],
            financial: [/price/, /cost/, /amount/, /budget/i]
        };

        for (const [patternType, regexes] of Object.entries(patterns)) {
            if (regexes.some(regex => regex.test(columnName))) {
                return patternType;
            }
        }

        return 'general';
    }

    assessDataQuality(columnAnalysis, submissions) {
        const totalColumns = Object.keys(columnAnalysis).length;
        let qualityScore = 0;
        const issues = [];

        for (const [columnName, analysis] of Object.entries(columnAnalysis)) {
            const completeness = analysis.nonEmptyValues / analysis.totalValues;
            
            if (completeness < 0.5) {
                issues.push(`Low data completeness in ${columnName} (${(completeness * 100).toFixed(1)}%)`);
            }
            
            if (analysis.dataType === 'unknown') {
                issues.push(`Unable to determine data type for ${columnName}`);
            }

            qualityScore += completeness * analysis.relevanceScore;
        }

        qualityScore = totalColumns > 0 ? qualityScore / totalColumns : 0;

        return {
            qualityScore: Math.round(qualityScore * 100),
            issues,
            totalColumns,
            meaningfulColumns: Object.values(columnAnalysis).filter(a => a.relevanceScore > 0.6).length,
            analyzedSubmissions: submissions.length
        };
    }

    // DOMAIN INSIGHTS GENERATION
    generateDomainInsights(columnAnalysis, prioritizedColumns) {
        const insights = {
            agriculture: {},
            geographic: {},
            economic: {},
            dataQuality: {}
        };

        // Agriculture insights
        const agColumns = prioritizedColumns.high.filter(c => 
            ['landUse', 'landArea', 'cropProduction', 'livestock'].includes(c.domain)
        );
        
        if (agColumns.length > 0) {
            insights.agriculture.hasData = true;
            insights.agriculture.columnCount = agColumns.length;
            insights.agriculture.domains = [...new Set(agColumns.map(c => c.domain))];
        }

        // Geographic insights
        const geoColumns = prioritizedColumns.high.filter(c => c.domain === 'geographic');
        if (geoColumns.length > 0) {
            insights.geographic.hasRegions = true;
            insights.geographic.regionColumns = geoColumns.map(c => c.column);
        }

        // Data quality insights
        const totalColumns = Object.keys(columnAnalysis).length;
        const highQualityColumns = Object.values(columnAnalysis).filter(a => 
            a.completeness > 0.8 && a.relevanceScore > 0.6
        ).length;

        insights.dataQuality.highQualityRatio = highQualityColumns / totalColumns;
        insights.dataQuality.totalMeaningfulColumns = totalColumns;

        return insights;
    }

    // CHART DATA PREPARATION METHODS
    async prepareChartData(projectUid, chartConfig, submissions) {
        try {
            const { chartType, config } = chartConfig;
            const { dataSource, column, xColumn, yColumn, groupBy } = config;

            let chartData = {
                labels: [],
                datasets: [],
                rawData: [],
                summary: {}
            };

            switch (chartType) {
                case 'pie':
                case 'doughnut':
                    chartData = this.preparePieChartData(column, submissions);
                    break;
                    
                case 'bar':
                    chartData = this.prepareBarChartData(xColumn, yColumn, groupBy, submissions);
                    break;
                    
                case 'line':
                    chartData = this.prepareLineChartData(config, submissions);
                    break;
                    
                case 'scatter':
                    chartData = this.prepareScatterChartData(xColumn, yColumn, submissions);
                    break;
                    
                case 'area':
                    chartData = this.prepareAreaChartData(config, submissions);
                    break;
                    
                default:
                    chartData = this.prepareBarChartData(xColumn || column, yColumn, groupBy, submissions);
            }

            chartData.metadata = {
                chartType,
                dataSource,
                totalDataPoints: submissions.length,
                generatedAt: new Date().toISOString()
            };

            return chartData;

        } catch (error) {
            console.error('Error preparing chart data:', error);
            throw new Error(`Failed to prepare chart data: ${error.message}`);
        }
    }

    preparePieChartData(column, submissions) {
        const valueCounts = {};
        submissions.forEach(sub => {
            const value = sub[column];
            if (value !== undefined && value !== null && value !== '') {
                const key = String(value).trim();
                valueCounts[key] = (valueCounts[key] || 0) + 1;
            }
        });

        const labels = Object.keys(valueCounts);
        const data = Object.values(valueCounts);
        const total = data.reduce((sum, count) => sum + count, 0);

        return {
            labels,
            datasets: [{
                label: column,
                data,
                backgroundColor: this.generateColors(labels.length)
            }],
            rawData: Object.entries(valueCounts).map(([label, count]) => ({ 
                label, 
                count, 
                percentage: (count / total * 100).toFixed(1) 
            }))
        };
    }

    prepareBarChartData(xColumn, yColumn, groupBy, submissions) {
        if (!yColumn && xColumn) {
            const valueCounts = {};
            submissions.forEach(sub => {
                const value = sub[xColumn];
                if (value !== undefined && value !== null && value !== '') {
                    const key = String(value).trim();
                    valueCounts[key] = (valueCounts[key] || 0) + 1;
                }
            });

            const labels = Object.keys(valueCounts);
            const data = Object.values(valueCounts);

            return {
                labels,
                datasets: [{
                    label: `Count of ${xColumn}`,
                    data,
                    backgroundColor: this.generateColors(labels.length)
                }],
                rawData: Object.entries(valueCounts).map(([label, count]) => ({ label, count }))
            };
        }

        const groups = {};
        
        submissions.forEach(sub => {
            const groupValue = groupBy ? sub[groupBy] : 'all';
            const xValue = sub[xColumn];
            const yValue = parseFloat(sub[yColumn]);

            if (xValue !== undefined && !isNaN(yValue)) {
                if (!groups[groupValue]) groups[groupValue] = {};
                groups[groupValue][xValue] = (groups[groupValue][xValue] || 0) + yValue;
            }
        });

        const labels = [...new Set(submissions.map(sub => sub[xColumn]).filter(val => val !== undefined))];
        const datasets = Object.keys(groups).map((group, index) => ({
            label: group,
            data: labels.map(label => groups[group][label] || 0),
            backgroundColor: this.generateColors(1, index / Math.max(1, Object.keys(groups).length))[0]
        }));

        return { 
            labels, 
            datasets,
            rawData: submissions.map(sub => ({
                x: sub[xColumn],
                y: sub[yColumn],
                group: groupBy ? sub[groupBy] : 'all'
            }))
        };
    }

    prepareLineChartData(config, submissions) {
        const { dateColumn, valueColumn } = config;
        const timeData = {};
        
        submissions.forEach(sub => {
            const dateValue = sub[dateColumn];
            const numericValue = parseFloat(sub[valueColumn]);

            if (dateValue && !isNaN(numericValue)) {
                const date = new Date(dateValue).toISOString().split('T')[0];
                timeData[date] = (timeData[date] || { sum: 0, count: 0 });
                timeData[date].sum += numericValue;
                timeData[date].count += 1;
            }
        });

        const labels = Object.keys(timeData).sort();
        const data = labels.map(date => timeData[date].sum / timeData[date].count);

        return {
            labels,
            datasets: [{
                label: valueColumn,
                data,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)'
            }],
            rawData: Object.entries(timeData).map(([date, stats]) => ({
                date,
                value: stats.sum / stats.count,
                count: stats.count
            }))
        };
    }

    prepareAreaChartData(config, submissions) {
        const lineData = this.prepareLineChartData(config, submissions);
        lineData.datasets[0].fill = true;
        return lineData;
    }

    prepareScatterChartData(xColumn, yColumn, submissions) {
        const data = submissions.map(sub => ({
            x: parseFloat(sub[xColumn]),
            y: parseFloat(sub[yColumn])
        })).filter(point => !isNaN(point.x) && !isNaN(point.y));

        return {
            datasets: [{
                label: `${yColumn} vs ${xColumn}`,
                data,
                backgroundColor: 'rgba(59, 130, 246, 0.6)'
            }],
            rawData: data
        };
    }

    generateColors(count, hueShift = 0) {
        const colors = [];
        for (let i = 0; i < count; i++) {
            const hue = (i * 360 / count + hueShift * 360) % 360;
            colors.push(`hsl(${hue}, 70%, 60%)`);
        }
        return colors;
    }
}

module.exports = new ChartAnalysisService();