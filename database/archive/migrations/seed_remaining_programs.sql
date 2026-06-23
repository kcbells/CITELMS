-- =============================================================
-- COC-LMS: Remaining 15 Programs Curriculum Data
-- Run AFTER seed_curriculum_data.sql (which handles BSIT and BSCS)
-- =============================================================

-- =============================================
-- BSCE - Bachelor of Science in Civil Engineering
-- program_id = 3
-- =============================================

-- BSCE . YEAR 1 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('CE111','Mathematics in the Modern World','Mathematical concepts and their applications in real life.',3,3,0,'None',3,1,1,'active'),
('CE112','Natural Sciences 1','Fundamental principles of physics and chemistry.',3,3,0,'None',3,1,1,'active'),
('CE113','Engineering Drawing 1','Basic engineering drawing and drafting principles.',3,2,1,'None',3,1,1,'active'),
('CE114','Calculus 1','Differential calculus and its engineering applications.',3,3,0,'None',3,1,1,'active'),
('CE115','Purposive Communication','Communication skills for engineers.',3,3,0,'None',3,1,1,'active'),
('CE116','PE 1 - Physical Fitness','Physical fitness activities and wellness.',2,2,0,'None',3,1,1,'active'),
('CE117','NSTP 1','National Service Training Program part 1.',3,3,0,'None',3,1,1,'active');

-- BSCE . YEAR 1 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('CE121','Calculus 2','Integral calculus and series.',3,3,0,'CE114',3,1,2,'active'),
('CE122','Physics for Engineers','Classical mechanics and thermodynamics.',3,2,1,'CE114',3,1,2,'active'),
('CE123','Engineering Drawing 2','Advanced drafting and CAD fundamentals.',3,2,1,'CE113',3,1,2,'active'),
('CE124','Chemistry for Engineers','Chemical principles relevant to civil engineering.',3,2,1,'None',3,1,2,'active'),
('CE125','The Contemporary World','Globalization and its impact on society.',3,3,0,'None',3,1,2,'active'),
('CE126','PE 2 - Team Sports','Team sports and sportsmanship.',2,2,0,'CE116',3,1,2,'active'),
('CE127','NSTP 2','National Service Training Program part 2.',3,3,0,'CE117',3,1,2,'active');

-- BSCE . YEAR 2 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('CE211','Calculus 3','Multivariable calculus and differential equations.',3,3,0,'CE121',3,2,1,'active'),
('CE212','Statics of Rigid Bodies','Principles of static equilibrium and force systems.',3,3,0,'CE122',3,2,1,'active'),
('CE213','Surveying 1','Fundamentals of land surveying.',3,2,1,'None',3,2,1,'active'),
('CE214','Engineering Materials','Properties and testing of construction materials.',3,2,1,'CE124',3,2,1,'active'),
('CE215','Computer Applications in CE','Software tools for civil engineering.',3,2,1,'None',3,2,1,'active'),
('CE216','Ethics for Engineers','Professional and ethical responsibilities of engineers.',3,3,0,'None',3,2,1,'active');

-- BSCE . YEAR 2 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('CE221','Strength of Materials','Stress, strain, and deformation in structural members.',3,3,0,'CE212',3,2,2,'active'),
('CE222','Fluid Mechanics','Hydrostatics and fluid flow principles.',3,3,0,'CE211',3,2,2,'active'),
('CE223','Surveying 2','Route and topographic surveying.',3,2,1,'CE213',3,2,2,'active'),
('CE224','Soil Mechanics','Properties and classification of soils.',3,2,1,'CE214',3,2,2,'active'),
('CE225','Dynamics of Rigid Bodies','Kinematics and kinetics of rigid bodies.',3,3,0,'CE212',3,2,2,'active'),
('CE226','Numerical Methods','Numerical solutions for engineering problems.',3,2,1,'CE211',3,2,2,'active');

-- BSCE . YEAR 3 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('CE311','Structural Theory 1','Analysis of statically determinate structures.',3,3,0,'CE221',3,3,1,'active'),
('CE312','Hydraulics','Applied fluid mechanics and hydraulic systems.',3,2,1,'CE222',3,3,1,'active'),
('CE313','Highway and Traffic Engineering','Road design and traffic management principles.',3,3,0,'CE223',3,3,1,'active'),
('CE314','Foundation Engineering','Design of shallow and deep foundations.',3,3,0,'CE224',3,3,1,'active'),
('CE315','Engineering Economy','Economic analysis for engineering decisions.',3,3,0,'None',3,3,1,'active'),
('CE316','Concrete Technology','Mix design, testing, and properties of concrete.',3,2,1,'CE214',3,3,1,'active');

-- BSCE . YEAR 3 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('CE321','Structural Theory 2','Analysis of indeterminate structures.',3,3,0,'CE311',3,3,2,'active'),
('CE322','Water Resources Engineering','Water supply, drainage, and irrigation systems.',3,3,0,'CE312',3,3,2,'active'),
('CE323','Construction Management','Project planning, scheduling, and cost control.',3,3,0,'CE315',3,3,2,'active'),
('CE324','Environmental Engineering','Water and wastewater treatment principles.',3,3,0,'CE222',3,3,2,'active'),
('CE325','Steel and Timber Design','Design of steel and timber structural members.',3,3,0,'CE311',3,3,2,'active'),
('CE326','Geotechnical Engineering','Advanced soil and rock mechanics.',3,3,0,'CE314',3,3,2,'active');

-- BSCE . YEAR 4 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('CE411','Reinforced Concrete Design','Design of RC beams, slabs, and columns per NSCP.',3,3,0,'CE321',3,4,1,'active'),
('CE412','CE Laws, Contracts and Ethics','Legal and professional responsibilities in civil engineering.',3,3,0,'None',3,4,1,'active'),
('CE413','Transportation Engineering','Advanced highway design and traffic engineering.',3,3,0,'CE313',3,4,1,'active'),
('CE414','Quantity Surveying and Estimating','Cost estimation and bill of materials preparation.',3,3,0,'CE323',3,4,1,'active'),
('CE415','CE Capstone Project 1','Research proposal and preliminary design project.',3,3,0,'CE321',3,4,1,'active');

-- BSCE . YEAR 4 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('CE421','CE Capstone Project 2','Final design and implementation of engineering project.',3,3,0,'CE415',3,4,2,'active'),
('CE422','CE Board Exam Review','Comprehensive review covering all CE board exam topics.',3,3,0,'CE411',3,4,2,'active'),
('CE423','OJT / Practicum','On-the-job training in civil engineering firms.',6,0,6,'CE414',3,4,2,'active');

-- =============================================
-- BSEE - Bachelor of Science in Electrical Engineering
-- program_id = 4
-- =============================================

-- BSEE . YEAR 1 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('EE111','Mathematics in the Modern World','Mathematical concepts and applications in modern context.',3,3,0,'None',4,1,1,'active'),
('EE112','Calculus 1','Limits, derivatives, and engineering applications.',3,3,0,'None',4,1,1,'active'),
('EE113','General Physics 1','Mechanics, waves, and thermodynamics.',3,2,1,'None',4,1,1,'active'),
('EE114','Engineering Drawing','Technical drawing and graphical communication.',3,2,1,'None',4,1,1,'active'),
('EE115','Purposive Communication','Technical and professional communication skills.',3,3,0,'None',4,1,1,'active'),
('EE116','PE 1 - Physical Fitness','Physical education and wellness activities.',2,2,0,'None',4,1,1,'active'),
('EE117','NSTP 1','National Service Training Program part 1.',3,3,0,'None',4,1,1,'active');

-- BSEE . YEAR 1 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('EE121','Calculus 2','Integral calculus and series applications.',3,3,0,'EE112',4,1,2,'active'),
('EE122','General Physics 2','Electricity, magnetism, and optics.',3,2,1,'EE113',4,1,2,'active'),
('EE123','Chemistry for Engineers','Chemical principles for engineering applications.',3,2,1,'None',4,1,2,'active'),
('EE124','Computer Fundamentals','Introduction to computing and programming concepts.',3,2,1,'None',4,1,2,'active'),
('EE125','The Contemporary World','Global issues and international perspectives.',3,3,0,'None',4,1,2,'active'),
('EE126','PE 2 - Rhythmic Activities','Dance and rhythmic physical activities.',2,2,0,'EE116',4,1,2,'active'),
('EE127','NSTP 2','National Service Training Program part 2.',3,3,0,'EE117',4,1,2,'active');

-- BSEE . YEAR 2 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('EE211','Calculus 3','Multivariable calculus and partial derivatives.',3,3,0,'EE121',4,2,1,'active'),
('EE212','Circuit Theory 1','DC circuits, network theorems, and transient analysis.',3,2,1,'EE122',4,2,1,'active'),
('EE213','Engineering Mechanics','Statics and dynamics for engineers.',3,3,0,'EE121',4,2,1,'active'),
('EE214','Differential Equations','Ordinary differential equations and engineering applications.',3,3,0,'EE121',4,2,1,'active'),
('EE215','Ethics for Engineers','Professional ethics and responsibilities of engineers.',3,3,0,'None',4,2,1,'active'),
('EE216','Engineering Economy','Economic decision-making for engineers.',3,3,0,'None',4,2,1,'active');

-- BSEE . YEAR 2 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('EE221','Circuit Theory 2','AC circuits, phasors, and frequency response analysis.',3,2,1,'EE212',4,2,2,'active'),
('EE222','Electronics 1','Semiconductor devices and basic electronic circuits.',3,2,1,'EE212',4,2,2,'active'),
('EE223','Electromagnetics 1','Electric and magnetic field theory.',3,3,0,'EE214',4,2,2,'active'),
('EE224','Numerical Methods','Numerical techniques for engineering problems.',3,2,1,'EE211',4,2,2,'active'),
('EE225','Thermodynamics','Energy systems and thermodynamic cycles.',3,3,0,'EE213',4,2,2,'active'),
('EE226','Technical Report Writing','Writing technical reports and engineering documentation.',3,3,0,'None',4,2,2,'active');

-- BSEE . YEAR 3 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('EE311','Electrical Machines 1','Transformers, DC machines, and induction motors.',3,2,1,'EE221',4,3,1,'active'),
('EE312','Electronics 2','Amplifiers, oscillators, and power electronics.',3,2,1,'EE222',4,3,1,'active'),
('EE313','Signals and Systems','Signal analysis and linear systems theory.',3,3,0,'EE221',4,3,1,'active'),
('EE314','Electromagnetics 2','Transmission lines and waveguide theory.',3,3,0,'EE223',4,3,1,'active'),
('EE315','Power Plant Engineering','Conventional and renewable energy power plants.',3,3,0,'EE225',4,3,1,'active'),
('EE316','Instrumentation and Measurement','Sensors, transducers, and measurement systems.',3,2,1,'EE221',4,3,1,'active');

-- BSEE . YEAR 3 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('EE321','Electrical Machines 2','Synchronous machines and special motors.',3,2,1,'EE311',4,3,2,'active'),
('EE322','Control Systems','Feedback control and system stability analysis.',3,3,0,'EE313',4,3,2,'active'),
('EE323','Power Systems Analysis','Load flow, fault analysis, and system protection.',3,3,0,'EE321',4,3,2,'active'),
('EE324','Illumination Engineering','Lighting design and photometric principles.',3,3,0,'EE221',4,3,2,'active'),
('EE325','EE Laws and Professional Practice','Legal framework and ethics in electrical engineering.',3,3,0,'None',4,3,2,'active'),
('EE326','Industrial Electronics','Power electronics and industrial drive systems.',3,2,1,'EE312',4,3,2,'active');

-- BSEE . YEAR 4 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('EE411','Electrical Systems Design','Design of electrical installations and building systems.',3,3,0,'EE323',4,4,1,'active'),
('EE412','Communications Engineering','Principles of analog and digital communications.',3,3,0,'EE313',4,4,1,'active'),
('EE413','High Voltage Engineering','Overvoltage protection and insulation coordination.',3,3,0,'EE323',4,4,1,'active'),
('EE414','EE Capstone Project 1','Research design and proposal in electrical engineering.',3,3,0,'EE322',4,4,1,'active'),
('EE415','EE Board Exam Review 1','Comprehensive review of core EE board exam topics.',3,3,0,'EE321',4,4,1,'active');

-- BSEE . YEAR 4 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('EE421','EE Capstone Project 2','Implementation and defense of electrical engineering project.',3,3,0,'EE414',4,4,2,'active'),
('EE422','EE Board Exam Review 2','Advanced review of EE board exam subjects.',3,3,0,'EE415',4,4,2,'active'),
('EE423','OJT / Practicum','Industrial training in electrical engineering companies.',6,0,6,'EE411',4,4,2,'active');

-- =============================================
-- BSME - Bachelor of Science in Mechanical Engineering
-- program_id = 5
-- =============================================

-- BSME . YEAR 1 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('ME111','Mathematics in the Modern World','Mathematical concepts and real-world applications.',3,3,0,'None',5,1,1,'active'),
('ME112','Calculus 1','Differential calculus for engineering.',3,3,0,'None',5,1,1,'active'),
('ME113','General Physics 1','Mechanics, heat, and thermodynamics.',3,2,1,'None',5,1,1,'active'),
('ME114','Engineering Drawing 1','Technical drawing and orthographic projection.',3,2,1,'None',5,1,1,'active'),
('ME115','Purposive Communication','Technical communication for engineers.',3,3,0,'None',5,1,1,'active'),
('ME116','PE 1 - Physical Fitness','Physical fitness and wellness program.',2,2,0,'None',5,1,1,'active'),
('ME117','NSTP 1','National Service Training Program part 1.',3,3,0,'None',5,1,1,'active');

-- BSME . YEAR 1 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('ME121','Calculus 2','Integral calculus and its applications.',3,3,0,'ME112',5,1,2,'active'),
('ME122','General Physics 2','Electricity, magnetism, and light.',3,2,1,'ME113',5,1,2,'active'),
('ME123','Chemistry for Engineers','Chemical principles for mechanical engineering.',3,2,1,'None',5,1,2,'active'),
('ME124','Engineering Drawing 2','CAD and advanced technical drawing.',3,2,1,'ME114',5,1,2,'active'),
('ME125','The Contemporary World','Global issues and Philippine society.',3,3,0,'None',5,1,2,'active'),
('ME126','PE 2 - Individual Sports','Individual sports and physical conditioning.',2,2,0,'ME116',5,1,2,'active'),
('ME127','NSTP 2','National Service Training Program part 2.',3,3,0,'ME117',5,1,2,'active');

-- BSME . YEAR 2 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('ME211','Differential Equations','ODE solutions and engineering applications.',3,3,0,'ME121',5,2,1,'active'),
('ME212','Statics of Rigid Bodies','Equilibrium and force analysis of rigid bodies.',3,3,0,'ME113',5,2,1,'active'),
('ME213','Engineering Materials','Mechanical properties and selection of materials.',3,2,1,'ME123',5,2,1,'active'),
('ME214','Thermodynamics 1','Laws of thermodynamics and energy analysis.',3,3,0,'ME122',5,2,1,'active'),
('ME215','Ethics for Engineers','Professional ethics in engineering practice.',3,3,0,'None',5,2,1,'active'),
('ME216','Engineering Economy','Economic analysis for engineering projects.',3,3,0,'None',5,2,1,'active');

-- BSME . YEAR 2 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('ME221','Dynamics of Rigid Bodies','Kinematics and kinetics of machines.',3,3,0,'ME212',5,2,2,'active'),
('ME222','Mechanics of Deformable Bodies','Stress, strain, and structural analysis.',3,3,0,'ME212',5,2,2,'active'),
('ME223','Thermodynamics 2','Power cycles, refrigeration, and psychrometrics.',3,3,0,'ME214',5,2,2,'active'),
('ME224','Fluid Mechanics','Fluid statics, kinematics, and dynamics.',3,3,0,'ME211',5,2,2,'active'),
('ME225','Numerical Methods in ME','Numerical solutions for mechanical engineering.',3,2,1,'ME211',5,2,2,'active'),
('ME226','Manufacturing Processes','Casting, forming, machining, and joining processes.',3,2,1,'ME213',5,2,2,'active');

-- BSME . YEAR 3 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('ME311','Machine Design 1','Design of machine elements and components.',3,3,0,'ME222',5,3,1,'active'),
('ME312','Fluid Machinery','Pumps, turbines, and compressors.',3,2,1,'ME224',5,3,1,'active'),
('ME313','Heat Transfer','Conduction, convection, and radiation.',3,3,0,'ME223',5,3,1,'active'),
('ME314','Theory of Machines','Mechanism analysis and synthesis.',3,3,0,'ME221',5,3,1,'active'),
('ME315','Industrial Plant Engineering','Layout, plant maintenance, and safety.',3,3,0,'ME226',5,3,1,'active'),
('ME316','Instrumentation and Control','Measurement systems and process control.',3,2,1,'ME225',5,3,1,'active');

-- BSME . YEAR 3 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('ME321','Machine Design 2','Advanced design of power transmission systems.',3,3,0,'ME311',5,3,2,'active'),
('ME322','Power Plant Engineering','Steam, internal combustion, and gas turbine plants.',3,3,0,'ME312',5,3,2,'active'),
('ME323','Refrigeration and Air Conditioning','RAC system design and principles.',3,3,0,'ME313',5,3,2,'active'),
('ME324','Automotive Engineering','Internal combustion engines and vehicle systems.',3,3,0,'ME312',5,3,2,'active'),
('ME325','ME Laws and Ethics','Legal framework for mechanical engineers.',3,3,0,'None',5,3,2,'active'),
('ME326','Welding Technology','Welding processes, codes, and inspection.',3,2,1,'ME226',5,3,2,'active');

-- BSME . YEAR 4 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('ME411','ME Capstone Project 1','Research design and proposal for mechanical engineering.',3,3,0,'ME321',5,4,1,'active'),
('ME412','ME Board Exam Review 1','Review of thermodynamics, machines, and RAC.',3,3,0,'ME322',5,4,1,'active'),
('ME413','Industrial Safety Engineering','Safety standards and hazard analysis in industry.',3,3,0,'ME315',5,4,1,'active'),
('ME414','Renewable Energy Systems','Solar, wind, and alternative energy technologies.',3,3,0,'ME322',5,4,1,'active'),
('ME415','Computer-Aided Engineering','FEA, CFD, and simulation tools.',3,2,1,'ME225',5,4,1,'active');

-- BSME . YEAR 4 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('ME421','ME Capstone Project 2','Implementation and defense of ME project.',3,3,0,'ME411',5,4,2,'active'),
('ME422','ME Board Exam Review 2','Comprehensive ME board exam preparation.',3,3,0,'ME412',5,4,2,'active'),
('ME423','OJT / Practicum','Industrial training in mechanical engineering firms.',6,0,6,'ME415',5,4,2,'active');

-- =============================================
-- BSCpE - Bachelor of Science in Computer Engineering
-- program_id = 6
-- =============================================

-- BSCpE . YEAR 1 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('CPE111','Mathematics in the Modern World','Mathematical reasoning and problem solving.',3,3,0,'None',6,1,1,'active'),
('CPE112','Calculus 1','Limits, derivatives, and integral concepts.',3,3,0,'None',6,1,1,'active'),
('CPE113','General Physics 1','Classical mechanics and thermodynamics.',3,2,1,'None',6,1,1,'active'),
('CPE114','Computer Programming 1','Fundamentals of programming using C.',3,2,1,'None',6,1,1,'active'),
('CPE115','Purposive Communication','Written and oral communication for engineers.',3,3,0,'None',6,1,1,'active'),
('CPE116','PE 1 - Physical Fitness','Physical fitness and health management.',2,2,0,'None',6,1,1,'active'),
('CPE117','NSTP 1','National Service Training Program part 1.',3,3,0,'None',6,1,1,'active');

-- BSCpE . YEAR 1 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('CPE121','Calculus 2','Integral calculus and engineering applications.',3,3,0,'CPE112',6,1,2,'active'),
('CPE122','General Physics 2','Electricity, magnetism, and waves.',3,2,1,'CPE113',6,1,2,'active'),
('CPE123','Discrete Mathematics','Logic, sets, combinatorics, and graph theory.',3,3,0,'None',6,1,2,'active'),
('CPE124','Computer Programming 2','Object-oriented programming concepts.',3,2,1,'CPE114',6,1,2,'active'),
('CPE125','The Contemporary World','Globalization and international relations.',3,3,0,'None',6,1,2,'active'),
('CPE126','PE 2 - Team Sports','Team sports and cooperative activities.',2,2,0,'CPE116',6,1,2,'active'),
('CPE127','NSTP 2','National Service Training Program part 2.',3,3,0,'CPE117',6,1,2,'active');

-- BSCpE . YEAR 2 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('CPE211','Differential Equations','Analytical and numerical solutions for ODEs.',3,3,0,'CPE121',6,2,1,'active'),
('CPE212','Digital Electronics 1','Number systems, logic gates, and combinational circuits.',3,2,1,'CPE122',6,2,1,'active'),
('CPE213','Data Structures and Algorithms','Arrays, lists, trees, and sorting algorithms.',3,2,1,'CPE124',6,2,1,'active'),
('CPE214','Circuit Theory 1','DC circuit analysis and network theorems.',3,2,1,'CPE122',6,2,1,'active'),
('CPE215','Engineering Economy','Economic analysis for technology projects.',3,3,0,'None',6,2,1,'active'),
('CPE216','Ethics for Engineers','Professional and ethical issues in computing.',3,3,0,'None',6,2,1,'active');

-- BSCpE . YEAR 2 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('CPE221','Digital Electronics 2','Sequential circuits, flip-flops, and state machines.',3,2,1,'CPE212',6,2,2,'active'),
('CPE222','Circuit Theory 2','AC circuits and frequency domain analysis.',3,2,1,'CPE214',6,2,2,'active'),
('CPE223','Computer Architecture 1','Organization and design of digital computers.',3,3,0,'CPE212',6,2,2,'active'),
('CPE224','Object-Oriented Programming','Advanced OOP with design patterns.',3,2,1,'CPE213',6,2,2,'active'),
('CPE225','Signals and Systems','Signal analysis and Fourier transforms.',3,3,0,'CPE211',6,2,2,'active'),
('CPE226','Technical Report Writing','Documentation and technical writing skills.',3,3,0,'None',6,2,2,'active');

-- BSCpE . YEAR 3 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('CPE311','Microprocessors and Microcontrollers','Programming and interfacing microprocessors.',3,2,1,'CPE221',6,3,1,'active'),
('CPE312','Computer Architecture 2','Pipelining, memory hierarchy, and multiprocessing.',3,3,0,'CPE223',6,3,1,'active'),
('CPE313','Operating Systems','OS concepts, processes, and memory management.',3,2,1,'CPE224',6,3,1,'active'),
('CPE314','Embedded Systems','Real-time programming for embedded devices.',3,2,1,'CPE311',6,3,1,'active'),
('CPE315','Communications Engineering','Digital and analog communications principles.',3,3,0,'CPE225',6,3,1,'active'),
('CPE316','Software Engineering','Software development life cycle and methodologies.',3,3,0,'CPE224',6,3,1,'active');

-- BSCpE . YEAR 3 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('CPE321','VLSI Design','Digital integrated circuit design principles.',3,2,1,'CPE221',6,3,2,'active'),
('CPE322','Computer Networks','Network protocols, TCP/IP, and network security.',3,2,1,'CPE315',6,3,2,'active'),
('CPE323','Database Systems','Relational databases and SQL.',3,2,1,'CPE313',6,3,2,'active'),
('CPE324','Digital Signal Processing','DSP algorithms and filter design.',3,3,0,'CPE225',6,3,2,'active'),
('CPE325','CpE Laws and Professional Practice','Legal and ethical standards for computer engineers.',3,3,0,'None',6,3,2,'active'),
('CPE326','Internet of Things','IoT architecture, protocols, and applications.',3,2,1,'CPE314',6,3,2,'active');

-- BSCpE . YEAR 4 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('CPE411','CpE Capstone Project 1','Research design and proposal for computer engineering.',3,3,0,'CPE316',6,4,1,'active'),
('CPE412','Artificial Intelligence','Machine learning and AI applications.',3,2,1,'CPE213',6,4,1,'active'),
('CPE413','Network Administration','Server management and network administration.',3,2,1,'CPE322',6,4,1,'active'),
('CPE414','CpE Board Exam Review 1','Review of electronics, circuits, and computer systems.',3,3,0,'CPE312',6,4,1,'active'),
('CPE415','Cybersecurity Fundamentals','Network security, cryptography, and ethical hacking.',3,2,1,'CPE322',6,4,1,'active');

-- BSCpE . YEAR 4 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('CPE421','CpE Capstone Project 2','Implementation and defense of computer engineering project.',3,3,0,'CPE411',6,4,2,'active'),
('CPE422','CpE Board Exam Review 2','Advanced review of CpE licensure exam subjects.',3,3,0,'CPE414',6,4,2,'active'),
('CPE423','OJT / Practicum','Industry training in computing and electronics firms.',6,0,6,'CPE413',6,4,2,'active');

-- =============================================
-- BSArch - Bachelor of Science in Architecture
-- program_id = 7
-- =============================================

-- BSArch . YEAR 1 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('AR111','Architecture Design 1','Introduction to design process and basic design principles.',3,2,1,'None',7,1,1,'active'),
('AR112','History of Architecture 1','Ancient to medieval architectural history.',3,3,0,'None',7,1,1,'active'),
('AR113','Architectural Drawing 1','Freehand drawing and sketching techniques.',3,2,1,'None',7,1,1,'active'),
('AR114','Mathematics for Architects','Pre-calculus and analytic geometry.',3,3,0,'None',7,1,1,'active'),
('AR115','Purposive Communication','Technical writing and oral communication skills.',3,3,0,'None',7,1,1,'active'),
('AR116','PE 1 - Physical Fitness','Physical wellness and fitness activities.',2,2,0,'None',7,1,1,'active'),
('AR117','NSTP 1','National Service Training Program part 1.',3,3,0,'None',7,1,1,'active');

-- BSArch . YEAR 1 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('AR121','Architecture Design 2','Space planning and functional design.',3,2,1,'AR111',7,1,2,'active'),
('AR122','History of Architecture 2','Renaissance to modern architectural movements.',3,3,0,'AR112',7,1,2,'active'),
('AR123','Architectural Drawing 2','Geometric drawing and technical drafting.',3,2,1,'AR113',7,1,2,'active'),
('AR124','Building Technology 1','Structural systems and construction materials.',3,3,0,'None',7,1,2,'active'),
('AR125','The Contemporary World','Globalization and sustainable development.',3,3,0,'None',7,1,2,'active'),
('AR126','PE 2 - Recreational Activities','Recreational sports and outdoor activities.',2,2,0,'AR116',7,1,2,'active'),
('AR127','NSTP 2','National Service Training Program part 2.',3,3,0,'AR117',7,1,2,'active');

-- BSArch . YEAR 2 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('AR211','Architecture Design 3','Residential building design and site planning.',3,2,1,'AR121',7,2,1,'active'),
('AR212','Architectural Theory 1','Theories and philosophies of architecture.',3,3,0,'AR122',7,2,1,'active'),
('AR213','Building Technology 2','Structural concrete and steel construction.',3,3,0,'AR124',7,2,1,'active'),
('AR214','Architectural Acoustics and Lighting','Sound, noise control, and daylighting design.',3,3,0,'None',7,2,1,'active'),
('AR215','Environmental Architecture','Passive design strategies for tropical climates.',3,3,0,'None',7,2,1,'active'),
('AR216','Ethics for Architects','Professional ethics and responsibilities.',3,3,0,'None',7,2,1,'active');

-- BSArch . YEAR 2 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('AR221','Architecture Design 4','Commercial and institutional building design.',3,2,1,'AR211',7,2,2,'active'),
('AR222','Architectural Theory 2','Contemporary and post-modern theories.',3,3,0,'AR212',7,2,2,'active'),
('AR223','Building Technology 3','Roof, walls, doors, and window systems.',3,3,0,'AR213',7,2,2,'active'),
('AR224','Structural Concepts in Architecture','Loads, forces, and structural behavior in design.',3,3,0,'AR213',7,2,2,'active'),
('AR225','Computer-Aided Architectural Design','CAD and BIM fundamentals for architects.',3,2,1,'None',7,2,2,'active'),
('AR226','Site Planning and Landscape Architecture','Site analysis, grading, and landscape design.',3,3,0,'AR211',7,2,2,'active');

-- BSArch . YEAR 3 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('AR311','Architecture Design 5','Multi-storey and mixed-use building design.',3,2,1,'AR221',7,3,1,'active'),
('AR312','Specifications and Quantity Surveying','Building specifications writing and cost estimation.',3,3,0,'AR223',7,3,1,'active'),
('AR313','Building Utilities 1','Plumbing, water supply, and sanitary systems.',3,3,0,'AR224',7,3,1,'active'),
('AR314','Urban Design and Planning','Urban morphology and masterplanning.',3,3,0,'AR226',7,3,1,'active'),
('AR315','Philippine Architecture','Regional and vernacular architecture of the Philippines.',3,3,0,'AR122',7,3,1,'active'),
('AR316','Construction Management and Law','Project management and architecture laws.',3,3,0,'AR312',7,3,1,'active');

-- BSArch . YEAR 3 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('AR321','Architecture Design 6','High-density urban building design.',3,2,1,'AR311',7,3,2,'active'),
('AR322','Building Utilities 2','Electrical, mechanical, and fire protection systems.',3,3,0,'AR313',7,3,2,'active'),
('AR323','Interior Design','Principles and elements of interior architecture.',3,3,0,'AR311',7,3,2,'active'),
('AR324','Sustainable Architecture','Green building standards and LEED principles.',3,3,0,'AR215',7,3,2,'active'),
('AR325','Architectural Photography','Documentation and presentation of architectural works.',3,2,1,'None',7,3,2,'active'),
('AR326','Project Development and Management','Real estate development and financial feasibility.',3,3,0,'AR316',7,3,2,'active');

-- BSArch . YEAR 4 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('AR411','Architecture Design 7 - Thesis Preparation','Pre-thesis design proposal and programming.',3,2,1,'AR321',7,4,1,'active'),
('AR412','Arch Laws and Professional Practice','Architecture Act and professional regulations.',3,3,0,'AR316',7,4,1,'active'),
('AR413','Digital Architecture','Parametric and computational design tools.',3,2,1,'AR225',7,4,1,'active'),
('AR414','Board Exam Review 1 - Design and Planning','Review of architectural design and planning topics.',3,3,0,'AR321',7,4,1,'active'),
('AR415','Board Exam Review 2 - Technology and Practice','Review of building technology and professional practice.',3,3,0,'AR322',7,4,1,'active');

-- BSArch . YEAR 4 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('AR421','Architectural Thesis','Final thesis design project and oral defense.',3,3,0,'AR411',7,4,2,'active'),
('AR422','Arch Board Exam Review Final','Comprehensive review for the Architecture licensure exam.',3,3,0,'AR414',7,4,2,'active'),
('AR423','OJT / Practicum','Architectural internship in licensed firms.',6,0,6,'AR412',7,4,2,'active');

-- =============================================
-- BSCrim - Bachelor of Science in Criminology
-- program_id = 8
-- =============================================

-- BSCrim . YEAR 1 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('CR111','Mathematics in the Modern World','Mathematical concepts and quantitative reasoning.',3,3,0,'None',8,1,1,'active'),
('CR112','Introduction to Criminology','Scope, nature, and history of criminology.',3,3,0,'None',8,1,1,'active'),
('CR113','Criminal Sociology','Social factors and crime causation theories.',3,3,0,'None',8,1,1,'active'),
('CR114','General Psychology','Fundamentals of human behavior and mental processes.',3,3,0,'None',8,1,1,'active'),
('CR115','Purposive Communication','Effective communication for criminology students.',3,3,0,'None',8,1,1,'active'),
('CR116','PE 1 - Physical Fitness','Physical fitness and law enforcement readiness.',2,2,0,'None',8,1,1,'active'),
('CR117','NSTP 1','National Service Training Program part 1.',3,3,0,'None',8,1,1,'active');

-- BSCrim . YEAR 1 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('CR121','Criminalistics 1','Principles of crime scene investigation.',3,2,1,'CR112',8,1,2,'active'),
('CR122','Criminal Law 1','Revised Penal Code and criminal liability.',3,3,0,'None',8,1,2,'active'),
('CR123','Law Enforcement Administration','Organization and management of police institutions.',3,3,0,'CR112',8,1,2,'active'),
('CR124','Philippine History','Philippine historical development and governance.',3,3,0,'None',8,1,2,'active'),
('CR125','The Contemporary World','Global issues and transnational crime.',3,3,0,'None',8,1,2,'active'),
('CR126','PE 2 - Self-Defense','Defensive tactics and martial arts basics.',2,2,0,'CR116',8,1,2,'active'),
('CR127','NSTP 2','National Service Training Program part 2.',3,3,0,'CR117',8,1,2,'active');

-- BSCrim . YEAR 2 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('CR211','Criminalistics 2','Fingerprinting, questioned documents, and photography.',3,2,1,'CR121',8,2,1,'active'),
('CR212','Criminal Law 2','Special criminal laws and crime classification.',3,3,0,'CR122',8,2,1,'active'),
('CR213','Juvenile Delinquency and Family Violence','Causes and prevention of youth crime and domestic violence.',3,3,0,'CR113',8,2,1,'active'),
('CR214','Ethics in Law Enforcement','Professional ethics and human rights.',3,3,0,'None',8,2,1,'active'),
('CR215','Penology and Corrections','Correctional systems and rehabilitation.',3,3,0,'CR112',8,2,1,'active'),
('CR216','Research Methods in Criminology','Quantitative and qualitative research design.',3,3,0,'None',8,2,1,'active');

-- BSCrim . YEAR 2 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('CR221','Criminalistics 3','Forensic chemistry, toxicology, and serology.',3,2,1,'CR211',8,2,2,'active'),
('CR222','Criminal Procedure','Rules of court, arrest, search, and seizure.',3,3,0,'CR212',8,2,2,'active'),
('CR223','Drug Education and Control','Drug abuse, legislation, and rehabilitation.',3,3,0,'None',8,2,2,'active'),
('CR224','Victimology','Study of crime victims and support systems.',3,3,0,'CR113',8,2,2,'active'),
('CR225','Public Safety Administration','Emergency management and disaster response.',3,3,0,'CR123',8,2,2,'active'),
('CR226','Statistical Analysis in Criminology','Application of statistics in crime analysis.',3,3,0,'CR216',8,2,2,'active');

-- BSCrim . YEAR 3 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('CR311','Criminalistics 4','Firearms identification and ballistics.',3,2,1,'CR221',8,3,1,'active'),
('CR312','Evidence and Investigation','Rules on evidence and investigative techniques.',3,3,0,'CR222',8,3,1,'active'),
('CR313','Traffic Management','Traffic laws and accident investigation.',3,3,0,'CR123',8,3,1,'active'),
('CR314','Organized Crime','Syndicated crime groups and counter-measures.',3,3,0,'CR212',8,3,1,'active'),
('CR315','Cyber Crime and Digital Forensics','Computer crime laws and digital evidence.',3,2,1,'CR211',8,3,1,'active'),
('CR316','Crisis Management','Hostage negotiation and crisis response.',3,3,0,'CR225',8,3,1,'active');

-- BSCrim . YEAR 3 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('CR321','Criminalistics 5','Questioned documents, polygraphy, and lie detection.',3,2,1,'CR311',8,3,2,'active'),
('CR322','Criminology Research Paper','Applied research and criminal justice analysis.',3,3,0,'CR226',8,3,2,'active'),
('CR323','Comparative Criminal Justice','Criminal justice systems worldwide.',3,3,0,'CR312',8,3,2,'active'),
('CR324','Anti-Graft and Corrupt Practices','Laws against corruption and public accountability.',3,3,0,'CR212',8,3,2,'active'),
('CR325','Community-Based Corrections','Probation, parole, and community service programs.',3,3,0,'CR215',8,3,2,'active'),
('CR326','Behavioral Science and Criminalistics','Profiling, behavioral analysis, and crime investigation.',3,3,0,'CR114',8,3,2,'active');

-- BSCrim . YEAR 4 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('CR411','Board Exam Review 1 - Criminal Jurisprudence','Review of criminal law and criminal procedure.',3,3,0,'CR312',8,4,1,'active'),
('CR412','Board Exam Review 2 - Criminalistics','Review of criminalistics and forensic science.',3,3,0,'CR311',8,4,1,'active'),
('CR413','Board Exam Review 3 - Law Enforcement','Review of police administration and law enforcement.',3,3,0,'CR123',8,4,1,'active'),
('CR414','Special Topics in Criminology','Current issues and developments in criminology.',3,3,0,'CR322',8,4,1,'active'),
('CR415','Crime Prevention Programs','Designing and implementing community crime prevention.',3,3,0,'CR316',8,4,1,'active');

-- BSCrim . YEAR 4 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('CR421','Criminology Capstone Project','Comprehensive research paper and defense.',3,3,0,'CR322',8,4,2,'active'),
('CR422','Board Exam Review 4 - Comprehensive','Final board exam review covering all subjects.',3,3,0,'CR411',8,4,2,'active'),
('CR423','OJT / Practicum','Field training in police, courts, or correctional facilities.',6,0,6,'CR413',8,4,2,'active');

-- =============================================
-- BEEd - Bachelor of Elementary Education
-- program_id = 9
-- =============================================

-- BEEd . YEAR 1 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('ED111','Mathematics in the Modern World','Mathematical concepts for teachers.',3,3,0,'None',9,1,1,'active'),
('ED112','Child and Adolescent Development','Developmental stages of learners.',3,3,0,'None',9,1,1,'active'),
('ED113','The Teaching Profession','Nature, history, and ethics of teaching.',3,3,0,'None',9,1,1,'active'),
('ED114','Filipino sa Piling Larangan','Akademikong Filipino para sa edukasyon.',3,3,0,'None',9,1,1,'active'),
('ED115','Purposive Communication','Communication skills for teachers.',3,3,0,'None',9,1,1,'active'),
('ED116','PE 1 - Physical Fitness','Physical fitness for educators.',2,2,0,'None',9,1,1,'active'),
('ED117','NSTP 1','National Service Training Program part 1.',3,3,0,'None',9,1,1,'active');

-- BEEd . YEAR 1 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('ED121','Science, Technology, and Society','Impact of technology on education and society.',3,3,0,'None',9,1,2,'active'),
('ED122','Foundations of Special Education','Principles of inclusive and special education.',3,3,0,'ED112',9,1,2,'active'),
('ED123','The Contemporary World','Global issues in education.',3,3,0,'None',9,1,2,'active'),
('ED124','Teaching Literature','Literature in elementary education.',3,3,0,'None',9,1,2,'active'),
('ED125','Art Education','Arts integration in elementary curriculum.',3,2,1,'None',9,1,2,'active'),
('ED126','PE 2 - Rhythmic Activities','Dance and rhythmic activities for educators.',2,2,0,'ED116',9,1,2,'active'),
('ED127','NSTP 2','National Service Training Program part 2.',3,3,0,'ED117',9,1,2,'active');

-- BEEd . YEAR 2 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('ED211','Facilitating Learner-Centered Teaching','Learner-centered approaches and differentiated instruction.',3,3,0,'ED112',9,2,1,'active'),
('ED212','Assessment in Learning 1','Principles and types of educational assessment.',3,3,0,'None',9,2,1,'active'),
('ED213','Teaching Math in Elementary 1','Math content and pedagogy for Grades 1-3.',3,3,0,'ED111',9,2,1,'active'),
('ED214','Teaching Science in Elementary 1','Science content and pedagogy for Grades 1-3.',3,3,0,'None',9,2,1,'active'),
('ED215','Social Dimensions of Education','Sociological foundations of education.',3,3,0,'None',9,2,1,'active'),
('ED216','Health Education','School health programs and physical fitness.',3,3,0,'None',9,2,1,'active');

-- BEEd . YEAR 2 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('ED221','Curriculum and Instruction','Curriculum development and instructional design.',3,3,0,'ED211',9,2,2,'active'),
('ED222','Assessment in Learning 2','Portfolio assessment and authentic evaluation.',3,3,0,'ED212',9,2,2,'active'),
('ED223','Teaching Math in Elementary 2','Math content and pedagogy for Grades 4-6.',3,3,0,'ED213',9,2,2,'active'),
('ED224','Teaching Science in Elementary 2','Science content and pedagogy for Grades 4-6.',3,3,0,'ED214',9,2,2,'active'),
('ED225','Educational Technology 1','Technology integration in elementary classrooms.',3,2,1,'None',9,2,2,'active'),
('ED226','Language Arts and Literacy','Reading, writing, and literacy instruction.',3,3,0,'None',9,2,2,'active');

-- BEEd . YEAR 3 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('ED311','Field Study 1','Classroom observation and participation.',3,2,1,'ED221',9,3,1,'active'),
('ED312','Teaching Social Studies in Elementary','HEKASI and MAPEH content and pedagogy.',3,3,0,'ED221',9,3,1,'active'),
('ED313','Teaching Filipino in Elementary','Mother tongue and Filipino language instruction.',3,3,0,'ED114',9,3,1,'active'),
('ED314','Technology for Teaching and Learning 2','Advanced technology tools for instruction.',3,2,1,'ED225',9,3,1,'active'),
('ED315','Principles and Ethics of Teaching','Professional ethics and responsibilities of teachers.',3,3,0,'ED113',9,3,1,'active'),
('ED316','Special Education Practicum','Inclusive classroom strategies and interventions.',3,2,1,'ED122',9,3,1,'active');

-- BEEd . YEAR 3 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('ED321','Field Study 2','Extended classroom participation and co-teaching.',3,2,1,'ED311',9,3,2,'active'),
('ED322','Educational Research','Action research for classroom improvement.',3,3,0,'None',9,3,2,'active'),
('ED323','Home, School, and Community Partnership','Family and community involvement in education.',3,3,0,'None',9,3,2,'active'),
('ED324','Contextualized and Indigenized Curriculum','Culturally responsive teaching strategies.',3,3,0,'ED221',9,3,2,'active'),
('ED325','Classroom Management and Organization','Managing learning environments effectively.',3,3,0,'ED211',9,3,2,'active'),
('ED326','Values Education','Character education and moral development.',3,3,0,'None',9,3,2,'active');

-- BEEd . YEAR 4 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('ED411','Student Teaching Preparation','Preparation seminar for practice teaching.',3,3,0,'ED321',9,4,1,'active'),
('ED412','LET Review 1 - Professional Education','Review of professional education subjects for licensure.',3,3,0,'ED322',9,4,1,'active'),
('ED413','LET Review 2 - General Education','Review of general education subjects for LET.',3,3,0,'None',9,4,1,'active'),
('ED414','Special Topics in Elementary Education','Current issues and innovations in elementary education.',3,3,0,'ED321',9,4,1,'active'),
('ED415','Seminar in Education','Research dissemination and professional development.',3,3,0,'ED322',9,4,1,'active');

-- BEEd . YEAR 4 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('ED421','Student Teaching','Full practice teaching in elementary schools.',3,3,0,'ED411',9,4,2,'active'),
('ED422','LET Review 3 - Content Knowledge','Review of subject-specific content knowledge.',3,3,0,'ED412',9,4,2,'active'),
('ED423','OJT / Practicum','Extended supervised practice teaching.',6,0,6,'ED411',9,4,2,'active');

-- =============================================
-- BSEd - Bachelor of Secondary Education
-- program_id = 10
-- =============================================

-- BSEd . YEAR 1 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('SEC111','Mathematics in the Modern World','Mathematical reasoning for secondary education.',3,3,0,'None',10,1,1,'active'),
('SEC112','Child and Adolescent Development','Developmental stages of secondary learners.',3,3,0,'None',10,1,1,'active'),
('SEC113','The Teaching Profession','Nature, history, and ethics of teaching.',3,3,0,'None',10,1,1,'active'),
('SEC114','Filipino sa Piling Larangan','Akademikong Filipino para sa edukasyon.',3,3,0,'None',10,1,1,'active'),
('SEC115','Purposive Communication','Communication skills for educators.',3,3,0,'None',10,1,1,'active'),
('SEC116','PE 1 - Physical Fitness','Physical fitness for teachers.',2,2,0,'None',10,1,1,'active'),
('SEC117','NSTP 1','National Service Training Program part 1.',3,3,0,'None',10,1,1,'active');

-- BSEd . YEAR 1 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('SEC121','Science, Technology, and Society','Impact of technology on secondary education.',3,3,0,'None',10,1,2,'active'),
('SEC122','Foundations of Special Education','Inclusive education principles for secondary level.',3,3,0,'SEC112',10,1,2,'active'),
('SEC123','The Contemporary World','Global issues and multicultural education.',3,3,0,'None',10,1,2,'active'),
('SEC124','Teaching of Literature','Literature appreciation and pedagogy.',3,3,0,'None',10,1,2,'active'),
('SEC125','Content Area 1 - Major Subject','Foundation course in major teaching specialization.',3,3,0,'None',10,1,2,'active'),
('SEC126','PE 2 - Team Sports','Team sports for educators.',2,2,0,'SEC116',10,1,2,'active'),
('SEC127','NSTP 2','National Service Training Program part 2.',3,3,0,'SEC117',10,1,2,'active');

-- BSEd . YEAR 2 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('SEC211','Facilitating Learner-Centered Teaching','Learner-centered and differentiated instruction.',3,3,0,'SEC112',10,2,1,'active'),
('SEC212','Assessment in Learning 1','Formative and summative assessment strategies.',3,3,0,'None',10,2,1,'active'),
('SEC213','Content Area 2 - Major Subject','Intermediate content course in major specialization.',3,3,0,'SEC125',10,2,1,'active'),
('SEC214','Educational Technology 1','Technology tools for secondary instruction.',3,2,1,'None',10,2,1,'active'),
('SEC215','Social Dimensions of Education','Sociological foundations of secondary education.',3,3,0,'None',10,2,1,'active'),
('SEC216','Values Education','Character formation and moral development.',3,3,0,'None',10,2,1,'active');

-- BSEd . YEAR 2 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('SEC221','Curriculum and Instruction','Secondary curriculum development and instructional design.',3,3,0,'SEC211',10,2,2,'active'),
('SEC222','Assessment in Learning 2','Performance-based and authentic assessment.',3,3,0,'SEC212',10,2,2,'active'),
('SEC223','Content Area 3 - Major Subject','Advanced content course in major specialization.',3,3,0,'SEC213',10,2,2,'active'),
('SEC224','Educational Technology 2','Advanced technology integration in secondary classes.',3,2,1,'SEC214',10,2,2,'active'),
('SEC225','Language and Literacy Across Curriculum','Reading and writing strategies in content areas.',3,3,0,'None',10,2,2,'active'),
('SEC226','Research in Education','Educational research methods and design.',3,3,0,'None',10,2,2,'active');

-- BSEd . YEAR 3 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('SEC311','Field Study 1','Classroom observation and analysis.',3,2,1,'SEC221',10,3,1,'active'),
('SEC312','Content Area 4 - Major Subject','Specialized content course for major subject.',3,3,0,'SEC223',10,3,1,'active'),
('SEC313','Teaching Strategies in Secondary Education','Innovative strategies for secondary classrooms.',3,3,0,'SEC211',10,3,1,'active'),
('SEC314','Principles and Ethics of Teaching','Professional ethics and teacher responsibilities.',3,3,0,'SEC113',10,3,1,'active'),
('SEC315','Classroom Management','Managing secondary learning environments.',3,3,0,'SEC211',10,3,1,'active'),
('SEC316','Home, School, and Community Linkage','Parent and community engagement strategies.',3,3,0,'None',10,3,1,'active');

-- BSEd . YEAR 3 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('SEC321','Field Study 2','Extended co-teaching and classroom participation.',3,2,1,'SEC311',10,3,2,'active'),
('SEC322','Content Area 5 - Capstone Major Subject','Comprehensive major subject capstone course.',3,3,0,'SEC312',10,3,2,'active'),
('SEC323','Contextualized Curriculum','Culturally responsive and localized instruction.',3,3,0,'SEC221',10,3,2,'active'),
('SEC324','Action Research','Classroom action research for improvement.',3,3,0,'SEC226',10,3,2,'active'),
('SEC325','Seminar on Educational Issues','Current trends and challenges in secondary education.',3,3,0,'SEC226',10,3,2,'active'),
('SEC326','Educational Leadership','Leadership roles and school administration.',3,3,0,'None',10,3,2,'active');

-- BSEd . YEAR 4 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('SEC411','Student Teaching Preparation','Orientation seminar before practice teaching.',3,3,0,'SEC321',10,4,1,'active'),
('SEC412','LET Review 1 - Professional Education','Review of professional education subjects.',3,3,0,'SEC324',10,4,1,'active'),
('SEC413','LET Review 2 - Content Knowledge','Review of major subject content for LET.',3,3,0,'SEC322',10,4,1,'active'),
('SEC414','Special Topics in Secondary Education','Emerging issues in secondary education.',3,3,0,'SEC325',10,4,1,'active'),
('SEC415','Guidance and Counseling','Guidance services and counseling in secondary schools.',3,3,0,'SEC112',10,4,1,'active');

-- BSEd . YEAR 4 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('SEC421','Student Teaching','Supervised full-time practice teaching.',3,3,0,'SEC411',10,4,2,'active'),
('SEC422','LET Review 3 - General Education','Comprehensive review of general education subjects.',3,3,0,'SEC412',10,4,2,'active'),
('SEC423','OJT / Practicum','Extended practice teaching and community immersion.',6,0,6,'SEC411',10,4,2,'active');

-- =============================================
-- BSA - Bachelor of Science in Accountancy
-- program_id = 11
-- =============================================

-- BSA . YEAR 1 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('ACC111','Mathematics in the Modern World','Mathematical concepts applied to business and accounting.',3,3,0,'None',11,1,1,'active'),
('ACC112','Business Economics','Microeconomic and macroeconomic principles for business.',3,3,0,'None',11,1,1,'active'),
('ACC113','Fundamentals of Accounting 1','Basic accounting concepts, principles, and the accounting cycle.',3,3,0,'None',11,1,1,'active'),
('ACC114','Business Communication','Professional communication for accountants.',3,3,0,'None',11,1,1,'active'),
('ACC115','Purposive Communication','Effective communication in professional settings.',3,3,0,'None',11,1,1,'active'),
('ACC116','PE 1 - Physical Fitness','Physical fitness and wellness.',2,2,0,'None',11,1,1,'active'),
('ACC117','NSTP 1','National Service Training Program part 1.',3,3,0,'None',11,1,1,'active');

-- BSA . YEAR 1 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('ACC121','Fundamentals of Accounting 2','Accounting for service and merchandising businesses.',3,3,0,'ACC113',11,1,2,'active'),
('ACC122','Business Organization and Management','Forms of business, management functions, and organization.',3,3,0,'None',11,1,2,'active'),
('ACC123','Philippine History','Historical context for governance and business.',3,3,0,'None',11,1,2,'active'),
('ACC124','Business Law','Obligations, contracts, and business transactions.',3,3,0,'None',11,1,2,'active'),
('ACC125','The Contemporary World','Global business environment and trade.',3,3,0,'None',11,1,2,'active'),
('ACC126','PE 2 - Team Sports','Team sports and physical wellness.',2,2,0,'ACC116',11,1,2,'active'),
('ACC127','NSTP 2','National Service Training Program part 2.',3,3,0,'ACC117',11,1,2,'active');

-- BSA . YEAR 2 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('ACC211','Intermediate Accounting 1','Accounting for assets and liabilities.',3,3,0,'ACC121',11,2,1,'active'),
('ACC212','Cost Accounting and Control','Job order, process, and standard costing systems.',3,3,0,'ACC121',11,2,1,'active'),
('ACC213','Computer Applications in Accounting','Accounting information systems and software.',3,2,1,'None',11,2,1,'active'),
('ACC214','Taxation 1 - Income Taxation','National Internal Revenue Code and income tax laws.',3,3,0,'ACC121',11,2,1,'active'),
('ACC215','Business Statistics','Statistical methods for business decision-making.',3,3,0,'None',11,2,1,'active'),
('ACC216','Ethics for Accountants','Professional ethics and the Code of Ethics for CPAs.',3,3,0,'None',11,2,1,'active');

-- BSA . YEAR 2 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('ACC221','Intermediate Accounting 2','Accounting for equity, investments, and special topics.',3,3,0,'ACC211',11,2,2,'active'),
('ACC222','Management Accounting 1','Cost-volume-profit analysis and budgeting.',3,3,0,'ACC212',11,2,2,'active'),
('ACC223','Auditing Theory','Principles and standards of auditing.',3,3,0,'ACC211',11,2,2,'active'),
('ACC224','Taxation 2 - Business Taxes','VAT, percentage tax, and other business taxes.',3,3,0,'ACC214',11,2,2,'active'),
('ACC225','Law on Business Organizations','Partnership, corporation, and cooperative law.',3,3,0,'ACC124',11,2,2,'active'),
('ACC226','Financial Management 1','Working capital management and financial analysis.',3,3,0,'ACC211',11,2,2,'active');

-- BSA . YEAR 3 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('ACC311','Advanced Financial Accounting 1','Business combinations and consolidated financial statements.',3,3,0,'ACC221',11,3,1,'active'),
('ACC312','Auditing and Assurance Services','External auditing procedures and reporting.',3,3,0,'ACC223',11,3,1,'active'),
('ACC313','Management Accounting 2','Advanced budgeting, standard costs, and decision-making.',3,3,0,'ACC222',11,3,1,'active'),
('ACC314','Taxation 3 - Transfer and Special Taxes','Estate tax, donor tax, and local government taxes.',3,3,0,'ACC224',11,3,1,'active'),
('ACC315','Financial Management 2','Capital budgeting and long-term financing decisions.',3,3,0,'ACC226',11,3,1,'active'),
('ACC316','Accounting Information Systems','Systems analysis and internal controls.',3,2,1,'ACC213',11,3,1,'active');

-- BSA . YEAR 3 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('ACC321','Advanced Financial Accounting 2','Foreign currency transactions and government accounting.',3,3,0,'ACC311',11,3,2,'active'),
('ACC322','CPA Board Exam Review 1 - FAR','Review of financial accounting and reporting.',3,3,0,'ACC311',11,3,2,'active'),
('ACC323','CPA Board Exam Review 2 - AFAR','Review of advanced financial accounting.',3,3,0,'ACC321',11,3,2,'active'),
('ACC324','CPA Board Exam Review 3 - Auditing','Review of auditing theory and practice.',3,3,0,'ACC312',11,3,2,'active'),
('ACC325','Government Accounting','NGAS and public sector financial management.',3,3,0,'ACC221',11,3,2,'active'),
('ACC326','Accounting Research','Research methods applied to accounting problems.',3,3,0,'None',11,3,2,'active');

-- BSA . YEAR 4 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('ACC411','CPA Board Exam Review 4 - Taxation','Comprehensive review of national and local taxation.',3,3,0,'ACC314',11,4,1,'active'),
('ACC412','CPA Board Exam Review 5 - MAS','Management advisory services review.',3,3,0,'ACC313',11,4,1,'active'),
('ACC413','CPA Board Exam Review 6 - RFBT','Regulatory framework and business transactions.',3,3,0,'ACC225',11,4,1,'active'),
('ACC414','Accounting Capstone Project','Integrative accounting research project.',3,3,0,'ACC326',11,4,1,'active'),
('ACC415','Seminar in Accounting','Current issues and developments in accounting.',3,3,0,'ACC326',11,4,1,'active');

-- BSA . YEAR 4 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('ACC421','Comprehensive CPA Review','Final integrated review of all CPA board exam subjects.',3,3,0,'ACC411',11,4,2,'active'),
('ACC422','Accounting Internship Seminar','Pre-internship orientation and professional development.',3,3,0,'ACC415',11,4,2,'active'),
('ACC423','OJT / Practicum','Internship in accounting firms, corporations, or government.',6,0,6,'ACC414',11,4,2,'active');

-- =============================================
-- BSBA - Bachelor of Science in Business Administration
-- program_id = 12
-- =============================================

-- BSBA . YEAR 1 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('BA111','Mathematics in the Modern World','Mathematical applications for business.',3,3,0,'None',12,1,1,'active'),
('BA112','Fundamentals of Accounting','Introduction to accounting and the business cycle.',3,3,0,'None',12,1,1,'active'),
('BA113','Principles of Management','Management functions, theories, and practices.',3,3,0,'None',12,1,1,'active'),
('BA114','Business Communication','Written and oral communication for business.',3,3,0,'None',12,1,1,'active'),
('BA115','Purposive Communication','Professional communication skills.',3,3,0,'None',12,1,1,'active'),
('BA116','PE 1 - Physical Fitness','Physical wellness and fitness.',2,2,0,'None',12,1,1,'active'),
('BA117','NSTP 1','National Service Training Program part 1.',3,3,0,'None',12,1,1,'active');

-- BSBA . YEAR 1 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('BA121','Business Economics','Micro and macroeconomics for business.',3,3,0,'None',12,1,2,'active'),
('BA122','Business Organization','Forms of business ownership and organizational structures.',3,3,0,'BA113',12,1,2,'active'),
('BA123','Business Law 1','Obligations, contracts, and business transactions.',3,3,0,'None',12,1,2,'active'),
('BA124','Computer Applications in Business','Spreadsheets, databases, and business software.',3,2,1,'None',12,1,2,'active'),
('BA125','The Contemporary World','Global business environment.',3,3,0,'None',12,1,2,'active'),
('BA126','PE 2 - Rhythmic Activities','Dance and recreational activities.',2,2,0,'BA116',12,1,2,'active'),
('BA127','NSTP 2','National Service Training Program part 2.',3,3,0,'BA117',12,1,2,'active');

-- BSBA . YEAR 2 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('BA211','Financial Accounting and Reporting','Accounting for assets and liabilities.',3,3,0,'BA112',12,2,1,'active'),
('BA212','Marketing Management','Marketing concepts, strategies, and consumer behavior.',3,3,0,'BA113',12,2,1,'active'),
('BA213','Operations Management','Production, quality control, and supply chain.',3,3,0,'BA113',12,2,1,'active'),
('BA214','Business Statistics','Statistical analysis for business decisions.',3,3,0,'None',12,2,1,'active'),
('BA215','Ethics in Business','Corporate social responsibility and business ethics.',3,3,0,'None',12,2,1,'active'),
('BA216','Human Behavior in Organizations','Organizational behavior and workplace dynamics.',3,3,0,'BA113',12,2,1,'active');

-- BSBA . YEAR 2 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('BA221','Managerial Accounting','Cost analysis, budgeting, and management decisions.',3,3,0,'BA211',12,2,2,'active'),
('BA222','Financial Management','Working capital, capital budgeting, and financing.',3,3,0,'BA211',12,2,2,'active'),
('BA223','Human Resource Management','Recruitment, training, compensation, and HR planning.',3,3,0,'BA113',12,2,2,'active'),
('BA224','Business Law 2','Commercial law, agency, and employment law.',3,3,0,'BA123',12,2,2,'active'),
('BA225','Entrepreneurship','Business plan development and startup management.',3,3,0,'BA122',12,2,2,'active'),
('BA226','Research Methods in Business','Business research design and data analysis.',3,3,0,'None',12,2,2,'active');

-- BSBA . YEAR 3 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('BA311','Strategic Management 1','Competitive analysis and strategy formulation.',3,3,0,'BA212',12,3,1,'active'),
('BA312','International Business','Global trade, foreign investment, and market entry.',3,3,0,'BA212',12,3,1,'active'),
('BA313','Business Taxation','Tax laws applicable to business enterprises.',3,3,0,'BA211',12,3,1,'active'),
('BA314','Supply Chain Management','Logistics, procurement, and distribution systems.',3,3,0,'BA213',12,3,1,'active'),
('BA315','Business Finance','Advanced topics in corporate finance.',3,3,0,'BA222',12,3,1,'active'),
('BA316','Project Management','Planning, scheduling, and controlling business projects.',3,3,0,'BA213',12,3,1,'active');

-- BSBA . YEAR 3 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('BA321','Strategic Management 2','Strategy implementation and competitive advantage.',3,3,0,'BA311',12,3,2,'active'),
('BA322','Business Policy and Governance','Corporate governance and risk management.',3,3,0,'BA311',12,3,2,'active'),
('BA323','E-Commerce and Digital Marketing','Online business models and digital marketing strategies.',3,2,1,'BA212',12,3,2,'active'),
('BA324','Consumer Behavior','Psychological and social factors in purchasing decisions.',3,3,0,'BA212',12,3,2,'active'),
('BA325','Business Research Project','Applied business research and presentation.',3,3,0,'BA226',12,3,2,'active'),
('BA326','Seminar in Business Administration','Current trends and emerging issues in business.',3,3,0,'BA226',12,3,2,'active');

-- BSBA . YEAR 4 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('BA411','Business Capstone Project 1','Business plan proposal and feasibility study.',3,3,0,'BA325',12,4,1,'active'),
('BA412','Sales and Distribution Management','Sales strategies, distribution channels, and management.',3,3,0,'BA212',12,4,1,'active'),
('BA413','Investment Management','Portfolio management and securities analysis.',3,3,0,'BA315',12,4,1,'active'),
('BA414','Total Quality Management','Quality management systems and continuous improvement.',3,3,0,'BA213',12,4,1,'active'),
('BA415','Business Ethics and Governance','Advanced corporate ethics and stakeholder management.',3,3,0,'BA215',12,4,1,'active');

-- BSBA . YEAR 4 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('BA421','Business Capstone Project 2','Business plan defense and final presentation.',3,3,0,'BA411',12,4,2,'active'),
('BA422','Business Management Seminar','Industry exposure and career development.',3,3,0,'BA326',12,4,2,'active'),
('BA423','OJT / Practicum','Industry internship in business and management firms.',6,0,6,'BA414',12,4,2,'active');

-- =============================================
-- BSMA - Bachelor of Science in Management Accounting
-- program_id = 13
-- =============================================

-- BSMA . YEAR 1 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('MAN111','Mathematics in the Modern World','Mathematical foundations for management accounting.',3,3,0,'None',13,1,1,'active'),
('MAN112','Fundamentals of Accounting 1','Basic accounting concepts and the accounting equation.',3,3,0,'None',13,1,1,'active'),
('MAN113','Principles of Management','Management theories and organizational structures.',3,3,0,'None',13,1,1,'active'),
('MAN114','Business Communication','Written and oral communication for managers.',3,3,0,'None',13,1,1,'active'),
('MAN115','Purposive Communication','Professional and academic communication.',3,3,0,'None',13,1,1,'active'),
('MAN116','PE 1 - Physical Fitness','Physical wellness program.',2,2,0,'None',13,1,1,'active'),
('MAN117','NSTP 1','National Service Training Program part 1.',3,3,0,'None',13,1,1,'active');

-- BSMA . YEAR 1 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('MAN121','Fundamentals of Accounting 2','Service and merchandising business accounting.',3,3,0,'MAN112',13,1,2,'active'),
('MAN122','Business Economics','Microeconomics and macroeconomics for managers.',3,3,0,'None',13,1,2,'active'),
('MAN123','Business Law','Obligations, contracts, and commercial law.',3,3,0,'None',13,1,2,'active'),
('MAN124','Computer Applications in Accounting','Spreadsheets and accounting software.',3,2,1,'None',13,1,2,'active'),
('MAN125','The Contemporary World','International business and global economics.',3,3,0,'None',13,1,2,'active'),
('MAN126','PE 2 - Individual Sports','Individual sports and physical conditioning.',2,2,0,'MAN116',13,1,2,'active'),
('MAN127','NSTP 2','National Service Training Program part 2.',3,3,0,'MAN117',13,1,2,'active');

-- BSMA . YEAR 2 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('MAN211','Intermediate Accounting 1','Current assets, liabilities, and the accounting process.',3,3,0,'MAN121',13,2,1,'active'),
('MAN212','Cost Accounting 1','Job order and process costing systems.',3,3,0,'MAN121',13,2,1,'active'),
('MAN213','Business Statistics','Statistical methods for management decisions.',3,3,0,'None',13,2,1,'active'),
('MAN214','Income Taxation','Individual and corporate income taxation.',3,3,0,'MAN121',13,2,1,'active'),
('MAN215','Ethics for Accountants','CPA code of ethics and professional standards.',3,3,0,'None',13,2,1,'active'),
('MAN216','Human Resource Management','HR planning, recruitment, and performance management.',3,3,0,'MAN113',13,2,1,'active');

-- BSMA . YEAR 2 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('MAN221','Intermediate Accounting 2','Non-current assets, long-term liabilities, and equity.',3,3,0,'MAN211',13,2,2,'active'),
('MAN222','Cost Accounting 2','Standard costing, variance analysis, and budgeting.',3,3,0,'MAN212',13,2,2,'active'),
('MAN223','Management Advisory Services 1','Performance measurement and decision support.',3,3,0,'MAN212',13,2,2,'active'),
('MAN224','Business Taxes','VAT, excise, and other business taxes.',3,3,0,'MAN214',13,2,2,'active'),
('MAN225','Financial Management','Capital structure, budgeting, and financial analysis.',3,3,0,'MAN211',13,2,2,'active'),
('MAN226','Auditing Principles','Fundamentals of auditing and assurance.',3,3,0,'MAN211',13,2,2,'active');

-- BSMA . YEAR 3 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('MAN311','Management Accounting 1','Strategic costing and value chain analysis.',3,3,0,'MAN222',13,3,1,'active'),
('MAN312','Management Advisory Services 2','Advanced management accounting for decision-making.',3,3,0,'MAN223',13,3,1,'active'),
('MAN313','Auditing and Assurance Services','Internal and external audit procedures.',3,3,0,'MAN226',13,3,1,'active'),
('MAN314','Transfer Taxes','Estate tax, donor tax, and documentary stamp tax.',3,3,0,'MAN224',13,3,1,'active'),
('MAN315','Accounting Information Systems','Systems design and internal controls.',3,2,1,'MAN124',13,3,1,'active'),
('MAN316','Research Methods','Business and accounting research design.',3,3,0,'None',13,3,1,'active');

-- BSMA . YEAR 3 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('MAN321','Management Accounting 2','Balanced scorecard, performance metrics, and strategy.',3,3,0,'MAN311',13,3,2,'active'),
('MAN322','Advanced Financial Accounting','Business combinations and consolidated statements.',3,3,0,'MAN221',13,3,2,'active'),
('MAN323','Government Accounting','NGAS, COA regulations, and public sector reporting.',3,3,0,'MAN221',13,3,2,'active'),
('MAN324','Strategic Management','Competitive strategy and corporate governance.',3,3,0,'MAN113',13,3,2,'active'),
('MAN325','Capstone Research','Integrative research in management accounting.',3,3,0,'MAN316',13,3,2,'active'),
('MAN326','Seminar in Management Accounting','Current issues in cost and management accounting.',3,3,0,'MAN316',13,3,2,'active');

-- BSMA . YEAR 4 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('MAN411','CMA Review 1 - Financial Reporting','Review of financial accounting and reporting topics.',3,3,0,'MAN322',13,4,1,'active'),
('MAN412','CMA Review 2 - Cost Accounting','Review of cost accounting and management advisory services.',3,3,0,'MAN321',13,4,1,'active'),
('MAN413','CMA Review 3 - Taxation','Review of taxation for management accountants.',3,3,0,'MAN314',13,4,1,'active'),
('MAN414','CMA Review 4 - Auditing','Review of auditing and assurance services.',3,3,0,'MAN313',13,4,1,'active'),
('MAN415','Capstone Project Presentation','Defense and presentation of capstone research.',3,3,0,'MAN325',13,4,1,'active');

-- BSMA . YEAR 4 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('MAN421','CMA Comprehensive Review','Integrated review covering all management accounting subjects.',3,3,0,'MAN411',13,4,2,'active'),
('MAN422','Management Accounting Seminar','Industry engagement and professional development.',3,3,0,'MAN326',13,4,2,'active'),
('MAN423','OJT / Practicum','Internship in accounting, audit, or management consulting firms.',6,0,6,'MAN414',13,4,2,'active');

-- =============================================
-- BSHM - Bachelor of Science in Hospitality Management
-- program_id = 14
-- =============================================

-- BSHM . YEAR 1 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('HM111','Mathematics in the Modern World','Mathematical applications in hospitality.',3,3,0,'None',14,1,1,'active'),
('HM112','Introduction to Hospitality Management','Overview of the hospitality and tourism industry.',3,3,0,'None',14,1,1,'active'),
('HM113','Food and Beverage Service Operations','Fundamentals of F and B service and dining.',3,2,1,'None',14,1,1,'active'),
('HM114','Principles of Management','Management theories applied to hospitality.',3,3,0,'None',14,1,1,'active'),
('HM115','Purposive Communication','Communication skills for hospitality professionals.',3,3,0,'None',14,1,1,'active'),
('HM116','PE 1 - Physical Fitness','Physical fitness and wellness.',2,2,0,'None',14,1,1,'active'),
('HM117','NSTP 1','National Service Training Program part 1.',3,3,0,'None',14,1,1,'active');

-- BSHM . YEAR 1 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('HM121','Culinary Arts 1','Basic knife skills, cooking methods, and kitchen safety.',3,2,1,'None',14,1,2,'active'),
('HM122','Front Office Operations','Hotel front desk procedures and reservations.',3,2,1,'HM112',14,1,2,'active'),
('HM123','Housekeeping Operations','Room and area cleaning procedures and standards.',3,2,1,'HM112',14,1,2,'active'),
('HM124','The Contemporary World','Global hospitality trends and sustainable tourism.',3,3,0,'None',14,1,2,'active'),
('HM125','Philippine History','Philippine cultural heritage and hospitality context.',3,3,0,'None',14,1,2,'active'),
('HM126','PE 2 - Recreational Activities','Recreational activities for guest engagement.',2,2,0,'HM116',14,1,2,'active'),
('HM127','NSTP 2','National Service Training Program part 2.',3,3,0,'HM117',14,1,2,'active');

-- BSHM . YEAR 2 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('HM211','Culinary Arts 2','International cuisines and advanced cooking techniques.',3,2,1,'HM121',14,2,1,'active'),
('HM212','Bar and Beverage Management','Beverage knowledge and bartending operations.',3,2,1,'HM113',14,2,1,'active'),
('HM213','Hospitality Marketing','Marketing strategies for hotels and restaurants.',3,3,0,'HM112',14,2,1,'active'),
('HM214','Accounting for Hospitality','Financial statements and accounting for hotels.',3,3,0,'None',14,2,1,'active'),
('HM215','Ethics in Hospitality','Professional ethics and customer service excellence.',3,3,0,'None',14,2,1,'active'),
('HM216','Safety and Sanitation','Food safety standards and HACCP principles.',3,2,1,'HM121',14,2,1,'active');

-- BSHM . YEAR 2 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('HM221','Culinary Arts 3','Pastry arts, bread making, and plating techniques.',3,2,1,'HM211',14,2,2,'active'),
('HM222','Events Management 1','Event planning fundamentals and coordination.',3,3,0,'HM112',14,2,2,'active'),
('HM223','Hotel Property Management','PMS systems and hotel operations software.',3,2,1,'HM122',14,2,2,'active'),
('HM224','Human Resource Management in Hospitality','Staffing, scheduling, and HR in hotels.',3,3,0,'HM114',14,2,2,'active'),
('HM225','Tourism and Hospitality Law','Laws governing hotels, restaurants, and tourism.',3,3,0,'None',14,2,2,'active'),
('HM226','Research Methods in Hospitality','Hospitality research design and data collection.',3,3,0,'None',14,2,2,'active');

-- BSHM . YEAR 3 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('HM311','Food Production Management','Kitchen management and menu engineering.',3,2,1,'HM221',14,3,1,'active'),
('HM312','Events Management 2','Conferences, weddings, and large-scale event production.',3,2,1,'HM222',14,3,1,'active'),
('HM313','Revenue Management','Yield management and pricing strategies.',3,3,0,'HM214',14,3,1,'active'),
('HM314','Tourism Destination Management','Managing tourist destinations and attractions.',3,3,0,'HM112',14,3,1,'active'),
('HM315','Facilities Management','Maintenance and management of hotel facilities.',3,3,0,'HM123',14,3,1,'active'),
('HM316','Hospitality Information Technology','IT systems for hospitality operations.',3,2,1,'None',14,3,1,'active');

-- BSHM . YEAR 3 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('HM321','Catering and Banquet Management','Off-premise catering and banquet service operations.',3,2,1,'HM311',14,3,2,'active'),
('HM322','Accommodation Management','Advanced hotel operations and room division management.',3,3,0,'HM223',14,3,2,'active'),
('HM323','Hospitality Financial Management','Budgeting, cost control, and financial analysis.',3,3,0,'HM313',14,3,2,'active'),
('HM324','Strategic Management in Hospitality','Competitive strategies for hotels and restaurants.',3,3,0,'HM213',14,3,2,'active'),
('HM325','Cross-Cultural Management','Managing diverse guests and staff in hospitality.',3,3,0,'None',14,3,2,'active'),
('HM326','Hospitality Research Project','Applied research in hospitality management.',3,3,0,'HM226',14,3,2,'active');

-- BSHM . YEAR 4 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('HM411','Hospitality Capstone 1','Business plan and concept development for hospitality venture.',3,3,0,'HM324',14,4,1,'active'),
('HM412','Sustainable Hospitality','Eco-tourism, green hotels, and sustainable practices.',3,3,0,'HM324',14,4,1,'active'),
('HM413','Hospitality Sales and Promotions','Sales management and promotional strategies.',3,3,0,'HM213',14,4,1,'active'),
('HM414','Seminar in Hospitality Management','Industry trends and career development.',3,3,0,'HM326',14,4,1,'active'),
('HM415','Pre-Practicum Orientation','Preparation for supervised work experience.',3,3,0,'HM322',14,4,1,'active');

-- BSHM . YEAR 4 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('HM421','Hospitality Capstone 2','Hospitality project defense and presentation.',3,3,0,'HM411',14,4,2,'active'),
('HM422','Industry Seminar','Current issues and innovations in global hospitality.',3,3,0,'HM414',14,4,2,'active'),
('HM423','OJT / Practicum','Supervised work experience in hotels or restaurants.',6,0,6,'HM415',14,4,2,'active');

-- =============================================
-- BSTM - Bachelor of Science in Tourism Management
-- program_id = 15
-- =============================================

-- BSTM . YEAR 1 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('TM111','Mathematics in the Modern World','Mathematical applications for tourism.',3,3,0,'None',15,1,1,'active'),
('TM112','Introduction to Tourism','History, scope, and significance of tourism.',3,3,0,'None',15,1,1,'active'),
('TM113','Tourism Geography','World geography for travel and tourism.',3,3,0,'None',15,1,1,'active'),
('TM114','Principles of Management','Management functions in the tourism context.',3,3,0,'None',15,1,1,'active'),
('TM115','Purposive Communication','Communication skills for tourism professionals.',3,3,0,'None',15,1,1,'active'),
('TM116','PE 1 - Physical Fitness','Physical fitness and wellness.',2,2,0,'None',15,1,1,'active'),
('TM117','NSTP 1','National Service Training Program part 1.',3,3,0,'None',15,1,1,'active');

-- BSTM . YEAR 1 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('TM121','Travel Agency and Tour Operations','Travel agency setup and tour product development.',3,3,0,'TM112',15,1,2,'active'),
('TM122','Hospitality and Tourism Services','Service quality and customer satisfaction.',3,3,0,'TM112',15,1,2,'active'),
('TM123','Philippine Tourism Resources','Cultural, natural, and heritage tourism of the Philippines.',3,3,0,'None',15,1,2,'active'),
('TM124','The Contemporary World','Global tourism trends and international travel.',3,3,0,'None',15,1,2,'active'),
('TM125','Philippine History','Philippine culture and heritage in tourism.',3,3,0,'None',15,1,2,'active'),
('TM126','PE 2 - Outdoor Activities','Eco-tourism activities and outdoor recreation.',2,2,0,'TM116',15,1,2,'active'),
('TM127','NSTP 2','National Service Training Program part 2.',3,3,0,'TM117',15,1,2,'active');

-- BSTM . YEAR 2 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('TM211','Tourism Marketing','Marketing strategies for tourism products and destinations.',3,3,0,'TM112',15,2,1,'active'),
('TM212','Meetings, Incentives, Conventions, and Exhibitions','MICE industry planning and management.',3,3,0,'TM121',15,2,1,'active'),
('TM213','Accounting for Tourism','Financial management and bookkeeping for tourism businesses.',3,3,0,'None',15,2,1,'active'),
('TM214','Eco-tourism Management','Sustainable tourism and environment conservation.',3,3,0,'TM112',15,2,1,'active'),
('TM215','Ethics in Tourism','Professional ethics, responsible tourism, and cultural sensitivity.',3,3,0,'None',15,2,1,'active'),
('TM216','Research Methods in Tourism','Tourism research design and data analysis.',3,3,0,'None',15,2,1,'active');

-- BSTM . YEAR 2 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('TM221','Events Management','Special events coordination and planning.',3,2,1,'TM212',15,2,2,'active'),
('TM222','Tourism Law and Regulations','Laws governing tourism operations in the Philippines.',3,3,0,'None',15,2,2,'active'),
('TM223','Human Resource Management in Tourism','HR practices for tourism businesses.',3,3,0,'TM114',15,2,2,'active'),
('TM224','Cultural and Heritage Tourism','Preservation and promotion of cultural heritage.',3,3,0,'TM123',15,2,2,'active'),
('TM225','Hotel and Restaurant Management','Hotel operations and food service management.',3,3,0,'TM122',15,2,2,'active'),
('TM226','Language for Tourism 1 - English','Advanced English for tourism and hospitality.',3,3,0,'None',15,2,2,'active');

-- BSTM . YEAR 3 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('TM311','Tourism Product Development','Creating and packaging tourism products.',3,3,0,'TM211',15,3,1,'active'),
('TM312','Destination Management','Managing tourist destinations and visitor experience.',3,3,0,'TM113',15,3,1,'active'),
('TM313','Tourism Information Systems','GIS, booking platforms, and tourism technology.',3,2,1,'None',15,3,1,'active'),
('TM314','Cruise Tourism Management','Cruise operations, ports, and itinerary planning.',3,3,0,'TM112',15,3,1,'active'),
('TM315','Adventure and Recreation Tourism','Adventure travel products and risk management.',3,3,0,'TM214',15,3,1,'active'),
('TM316','Language for Tourism 2 - Conversational','Foreign language basics for tourism professionals.',3,3,0,'TM226',15,3,1,'active');

-- BSTM . YEAR 3 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('TM321','Strategic Tourism Management','Strategy and competitive advantage in tourism.',3,3,0,'TM211',15,3,2,'active'),
('TM322','Revenue Management for Tourism','Pricing, yield management, and revenue optimization.',3,3,0,'TM213',15,3,2,'active'),
('TM323','Global Tourism Issues','Overtourism, sustainability, and post-pandemic recovery.',3,3,0,'TM216',15,3,2,'active'),
('TM324','Tourism Entrepreneurship','Starting and managing tourism enterprises.',3,3,0,'TM112',15,3,2,'active'),
('TM325','Tourism Research Project','Applied tourism research and project proposal.',3,3,0,'TM216',15,3,2,'active'),
('TM326','Seminar in Tourism Management','Industry insights and career pathways.',3,3,0,'TM216',15,3,2,'active');

-- BSTM . YEAR 4 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('TM411','Tourism Capstone 1','Tourism venture concept and feasibility study.',3,3,0,'TM321',15,4,1,'active'),
('TM412','Medical and Wellness Tourism','Health, spa, and medical travel management.',3,3,0,'TM311',15,4,1,'active'),
('TM413','Film and Cultural Tourism','Media-driven tourism and cultural experiences.',3,3,0,'TM224',15,4,1,'active'),
('TM414','Pre-Practicum Orientation','Preparation for supervised industry training.',3,3,0,'TM322',15,4,1,'active'),
('TM415','Tourism Policy and Planning','National tourism policy and masterplan.',3,3,0,'TM321',15,4,1,'active');

-- BSTM . YEAR 4 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('TM421','Tourism Capstone 2','Defense and final presentation of tourism project.',3,3,0,'TM411',15,4,2,'active'),
('TM422','Industry Seminar and Portfolio','Industry engagement and professional portfolio development.',3,3,0,'TM326',15,4,2,'active'),
('TM423','OJT / Practicum','Supervised industry training in tourism and travel companies.',6,0,6,'TM414',15,4,2,'active');

-- =============================================
-- BSN - Bachelor of Science in Nursing
-- program_id = 16
-- =============================================

-- BSN . YEAR 1 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('NUR111','Mathematics in the Modern World','Mathematical applications in health sciences.',3,3,0,'None',16,1,1,'active'),
('NUR112','Anatomy and Physiology 1','Structure and function of the human body, part 1.',3,2,1,'None',16,1,1,'active'),
('NUR113','Biochemistry for Nurses','Biochemical processes relevant to nursing.',3,2,1,'None',16,1,1,'active'),
('NUR114','Health Assessment','Physical examination and health history taking.',3,2,1,'None',16,1,1,'active'),
('NUR115','Purposive Communication','Communication skills for nurses.',3,3,0,'None',16,1,1,'active'),
('NUR116','PE 1 - Physical Fitness','Physical fitness for healthcare providers.',2,2,0,'None',16,1,1,'active'),
('NUR117','NSTP 1','National Service Training Program part 1.',3,3,0,'None',16,1,1,'active');

-- BSN . YEAR 1 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('NUR121','Anatomy and Physiology 2','Body systems, pathophysiology, and clinical correlations.',3,2,1,'NUR112',16,1,2,'active'),
('NUR122','Microbiology and Parasitology','Pathogens, infection control, and sterile techniques.',3,2,1,'NUR113',16,1,2,'active'),
('NUR123','Nutrition and Diet Therapy','Nutritional science and therapeutic diets.',3,3,0,'NUR113',16,1,2,'active'),
('NUR124','Pharmacology 1','Drug classifications, actions, and nursing considerations.',3,3,0,'NUR113',16,1,2,'active'),
('NUR125','The Contemporary World','Global health issues and nursing perspectives.',3,3,0,'None',16,1,2,'active'),
('NUR126','PE 2 - Individual Sports','Physical wellness and recreational sports.',2,2,0,'NUR116',16,1,2,'active'),
('NUR127','NSTP 2','National Service Training Program part 2.',3,3,0,'NUR117',16,1,2,'active');

-- BSN . YEAR 2 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('NUR211','Fundamentals of Nursing Practice','Basic nursing care, skills, and clinical competencies.',3,2,1,'NUR114',16,2,1,'active'),
('NUR212','Pharmacology 2','Advanced pharmacology and medication administration.',3,3,0,'NUR124',16,2,1,'active'),
('NUR213','Medical-Surgical Nursing 1','Care of adult patients with medical conditions.',3,2,1,'NUR121',16,2,1,'active'),
('NUR214','Introduction to Nursing Research','Research methods and evidence-based nursing.',3,3,0,'None',16,2,1,'active'),
('NUR215','Nursing Ethics and Jurisprudence','Ethical principles and nursing laws in the Philippines.',3,3,0,'None',16,2,1,'active'),
('NUR216','Pathophysiology','Disease mechanisms and clinical manifestations.',3,3,0,'NUR121',16,2,1,'active');

-- BSN . YEAR 2 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('NUR221','Medical-Surgical Nursing 2','Surgical and post-operative nursing care.',3,2,1,'NUR213',16,2,2,'active'),
('NUR222','Maternal and Child Nursing 1','Antepartum, intrapartum, and postpartum care.',3,2,1,'NUR211',16,2,2,'active'),
('NUR223','Pediatric Nursing','Care of infants, children, and adolescents.',3,2,1,'NUR211',16,2,2,'active'),
('NUR224','Community Health Nursing','Primary health care and community nursing.',3,2,1,'NUR211',16,2,2,'active'),
('NUR225','Mental Health Nursing','Psychiatric nursing and therapeutic communication.',3,2,1,'NUR211',16,2,2,'active'),
('NUR226','Clinical Nursing Skills Lab','Simulation-based clinical skills training.',3,2,1,'NUR211',16,2,2,'active');

-- BSN . YEAR 3 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('NUR311','Medical-Surgical Nursing 3','Critical care and complex surgical nursing.',3,2,1,'NUR221',16,3,1,'active'),
('NUR312','Maternal and Child Nursing 2','Newborn care and high-risk obstetric nursing.',3,2,1,'NUR222',16,3,1,'active'),
('NUR313','Gerontological Nursing','Care of elderly patients and aging issues.',3,2,1,'NUR221',16,3,1,'active'),
('NUR314','Perioperative Nursing','Preoperative, intraoperative, and PACU nursing care.',3,2,1,'NUR221',16,3,1,'active'),
('NUR315','Emergency and Disaster Nursing','Triage, emergency care, and disaster response.',3,2,1,'NUR221',16,3,1,'active'),
('NUR316','Nursing Research Application','Evidence-based practice and nursing research utilization.',3,3,0,'NUR214',16,3,1,'active');

-- BSN . YEAR 3 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('NUR321','Neurological Nursing','Neurological assessment and nursing care.',3,2,1,'NUR311',16,3,2,'active'),
('NUR322','Oncology Nursing','Cancer care, chemotherapy, and palliative nursing.',3,2,1,'NUR311',16,3,2,'active'),
('NUR323','Endocrine and Metabolic Nursing','Diabetes, thyroid, and metabolic disorder care.',3,2,1,'NUR311',16,3,2,'active'),
('NUR324','Public Health Nursing','Epidemiology, disease control, and public health programs.',3,2,1,'NUR224',16,3,2,'active'),
('NUR325','Nursing Leadership and Management','Leadership roles, delegation, and nursing administration.',3,3,0,'NUR215',16,3,2,'active'),
('NUR326','Nursing Capstone Research','Applied clinical nursing research project.',3,3,0,'NUR316',16,3,2,'active');

-- BSN . YEAR 4 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('NUR411','NLE Review 1 - Medical-Surgical Nursing','Board exam review of medical-surgical nursing.',3,3,0,'NUR321',16,4,1,'active'),
('NUR412','NLE Review 2 - Community and Maternal Nursing','Review of community and maternal child nursing.',3,3,0,'NUR324',16,4,1,'active'),
('NUR413','NLE Review 3 - Mental Health and Pediatrics','Review of psychiatric and pediatric nursing.',3,3,0,'NUR225',16,4,1,'active'),
('NUR414','Nursing Informatics','Health information systems and electronic health records.',3,2,1,'None',16,4,1,'active'),
('NUR415','Pre-Practicum Seminar','Preparation for comprehensive clinical training.',3,3,0,'NUR325',16,4,1,'active');

-- BSN . YEAR 4 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('NUR421','NLE Comprehensive Review','Integrated review of all NLE subjects.',3,3,0,'NUR411',16,4,2,'active'),
('NUR422','Nursing Seminar and Current Issues','Contemporary issues and developments in nursing.',3,3,0,'NUR415',16,4,2,'active'),
('NUR423','OJT / Practicum','Comprehensive clinical training in hospital and community settings.',6,0,6,'NUR415',16,4,2,'active');

-- =============================================
-- BSPsych - Bachelor of Science in Psychology
-- program_id = 17
-- =============================================

-- BSPsych . YEAR 1 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('PSY111','Mathematics in the Modern World','Quantitative reasoning and mathematical thinking.',3,3,0,'None',17,1,1,'active'),
('PSY112','Introduction to Psychology','Overview of psychology as a science and profession.',3,3,0,'None',17,1,1,'active'),
('PSY113','Biological Psychology','Brain, behavior, and the biological basis of psychology.',3,3,0,'None',17,1,1,'active'),
('PSY114','Developmental Psychology','Human development from conception to death.',3,3,0,'None',17,1,1,'active'),
('PSY115','Purposive Communication','Communication for psychology students.',3,3,0,'None',17,1,1,'active'),
('PSY116','PE 1 - Physical Fitness','Physical wellness and mental health connections.',2,2,0,'None',17,1,1,'active'),
('PSY117','NSTP 1','National Service Training Program part 1.',3,3,0,'None',17,1,1,'active');

-- BSPsych . YEAR 1 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('PSY121','General Psychology with Laboratory','Experimental methods and psychological observation.',3,2,1,'PSY112',17,1,2,'active'),
('PSY122','Social Psychology','Social influence, attitudes, and group behavior.',3,3,0,'PSY112',17,1,2,'active'),
('PSY123','Cognitive Psychology','Perception, memory, language, and problem-solving.',3,3,0,'PSY112',17,1,2,'active'),
('PSY124','Philippine History','Philippine culture and historical context for psychology.',3,3,0,'None',17,1,2,'active'),
('PSY125','The Contemporary World','Global issues through a psychological lens.',3,3,0,'None',17,1,2,'active'),
('PSY126','PE 2 - Team Sports','Team activities and group dynamics.',2,2,0,'PSY116',17,1,2,'active'),
('PSY127','NSTP 2','National Service Training Program part 2.',3,3,0,'PSY117',17,1,2,'active');

-- BSPsych . YEAR 2 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('PSY211','Statistics for Psychology','Descriptive and inferential statistics for behavioral sciences.',3,3,0,'None',17,2,1,'active'),
('PSY212','Personality Theories','Major theories of personality and assessment.',3,3,0,'PSY112',17,2,1,'active'),
('PSY213','Experimental Psychology','Research design and experimental methods.',3,2,1,'PSY121',17,2,1,'active'),
('PSY214','Abnormal Psychology','Diagnosis, etiology, and treatment of psychological disorders.',3,3,0,'PSY112',17,2,1,'active'),
('PSY215','Ethics in Psychology','Ethical principles and professional standards in psychology.',3,3,0,'None',17,2,1,'active'),
('PSY216','Sociology','Social structures, institutions, and behavior.',3,3,0,'None',17,2,1,'active');

-- BSPsych . YEAR 2 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('PSY221','Research Methods in Psychology','Quantitative and qualitative research designs.',3,3,0,'PSY213',17,2,2,'active'),
('PSY222','Industrial and Organizational Psychology','Workplace behavior, motivation, and HR applications.',3,3,0,'PSY112',17,2,2,'active'),
('PSY223','Psychological Testing and Assessment 1','Test theory, standardization, and intelligence tests.',3,2,1,'PSY212',17,2,2,'active'),
('PSY224','Health Psychology','Psychological factors in physical health and illness.',3,3,0,'PSY113',17,2,2,'active'),
('PSY225','Educational Psychology','Learning theories and psychology in education.',3,3,0,'PSY114',17,2,2,'active'),
('PSY226','Counseling Psychology','Counseling theories and basic helping skills.',3,3,0,'PSY212',17,2,2,'active');

-- BSPsych . YEAR 3 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('PSY311','Psychological Testing and Assessment 2','Projective tests, neuropsychological assessment, and interpretation.',3,2,1,'PSY223',17,3,1,'active'),
('PSY312','Clinical Psychology','Psychopathology and psychological interventions.',3,3,0,'PSY214',17,3,1,'active'),
('PSY313','Psychotherapy','Major therapeutic approaches and techniques.',3,3,0,'PSY226',17,3,1,'active'),
('PSY314','Psychopharmacology','Psychoactive drugs and their effects on behavior.',3,3,0,'PSY113',17,3,1,'active'),
('PSY315','Applied Statistics for Psychology','Advanced statistical analysis and SPSS.',3,2,1,'PSY211',17,3,1,'active'),
('PSY316','Community Psychology','Psychological intervention in community settings.',3,3,0,'PSY112',17,3,1,'active');

-- BSPsych . YEAR 3 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('PSY321','Child and Adolescent Psychopathology','Developmental disorders and childhood mental health.',3,3,0,'PSY214',17,3,2,'active'),
('PSY322','Forensic Psychology','Psychology in legal, criminal, and judicial contexts.',3,3,0,'PSY214',17,3,2,'active'),
('PSY323','Human Sexuality','Psychological aspects of gender, intimacy, and sexuality.',3,3,0,'PSY114',17,3,2,'active'),
('PSY324','Positive Psychology','Well-being, resilience, strengths, and flourishing.',3,3,0,'PSY112',17,3,2,'active'),
('PSY325','Psychology Research Paper','Applied psychological research and academic writing.',3,3,0,'PSY221',17,3,2,'active'),
('PSY326','Gerontological Psychology','Psychological issues and care of older adults.',3,3,0,'PSY114',17,3,2,'active');

-- BSPsych . YEAR 4 . 1ST SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('PSY411','Psychology Capstone Project 1','Research design, proposal, and data collection.',3,3,0,'PSY325',17,4,1,'active'),
('PSY412','Organizational Development','OD interventions, change management, and consulting.',3,3,0,'PSY222',17,4,1,'active'),
('PSY413','Trauma and Crisis Intervention','Crisis counseling and psychological first aid.',3,3,0,'PSY313',17,4,1,'active'),
('PSY414','Seminar in Psychology','Current issues and emerging fields in psychology.',3,3,0,'PSY325',17,4,1,'active'),
('PSY415','Pre-Practicum Orientation','Preparation for supervised psychological practice.',3,3,0,'PSY311',17,4,1,'active');

-- BSPsych . YEAR 4 . 2ND SEMESTER
INSERT IGNORE INTO subject (subject_code, subject_name, description, units, lecture_hours, lab_hours, pre_requisite, program_id, year_level, semester, status) VALUES
('PSY421','Psychology Capstone Project 2','Research defense and dissemination of findings.',3,3,0,'PSY411',17,4,2,'active'),
('PSY422','Psychology Licensure Exam Review','Comprehensive review for the RPm board exam.',3,3,0,'PSY414',17,4,2,'active'),
('PSY423','OJT / Practicum','Supervised clinical or industrial psychology practice.',6,0,6,'PSY415',17,4,2,'active');

