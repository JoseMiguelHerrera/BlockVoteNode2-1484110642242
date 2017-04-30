/*	var edin_pop = 495360;
    var glasgow_pop = 598830;
    var aberdeen_pop = 228990;
    var Dundee_pop = 148210;


    var edin = {
        'yes': .40*edin_pop,
        'no': .50*edin_pop,
        'maybe': .10*edin_pop
    }

    var glasg = {
        'yes': .70*glasgow_pop,
        'no': .20*glasgow_pop,
        'maybe': .10*glasgow_pop
    }

    var aber = {
        'yes': .20*aberdeen_pop,
        'no': .75*aberdeen_pop,
        'maybe': .5*aberdeen_pop
    }

    var dun = {
        'yes': .45*Dundee_pop,
        'no': .45*Dundee_pop,
        'maybe': .90*Dundee_pop
    }

    var data = [
        {districtName: "edin", yes: edin.yes, no: edin.no, maybe: edin.maybe},
        {districtName: "glasgow", yes: glasg.yes, no: glasg.no, maybe: glasg.maybe},
        {districtName: "aberdeen", yes: aber.yes, no: aber.no, maybe: aber.maybe},
        {districtName: "Dundee", yes: dun.yes, no: dun.no, maybe: dun.maybe},
        {districtName: "r1", yes: 5, no:5, maybe:5},
        {districtName: "r2", yes: 10, no:5, maybe:5}
    ];
	
	var dataTotal = [{districtName: "total", yes: edin.yes + glasg.yes + aber.yes + dun.yes, no: edin.no + glasg.no + aber.no + dun.no, maybe: edin.maybe + glasg.maybe + aber.maybe + dun.maybe}];

    var dataBubble =[
        {districtName: "edin", votes: edin.yes + edin.no + edin.maybe},
        {districtName: "glasgow", votes: glasg.yes + glasg.no + glasg.maybe},
        {districtName: "aberdeen", votes: aber.yes + aber.no + aber.maybe},
        {districtName: "Dundee", votes: dun.yes + dun.no + dun.maybe},
        {districtName: "r1", votes: 38000},
        {districtName: "r2", votes: 10000},
        {districtName: "r3", votes: 1000000},
        {districtName: "r4", votes: 700000}
    ];*/
	

//http://jnnnnn.github.io/category-colors-constrained.html
var colors = ["#6FD08C", "#FFED7C", "D33F49", "#fec7f8", "#3957ff", "#c203c8" ,
"#0bf0e9", "#fd9b39", "#888593", "#906407", "#98ba7f", "#fe6794", "#10b0ff", "#ac7bff", 
"#fee7c0", "#964c63", "#1da49c", "#0ad811", "#bbd9fd", "#fe6cfe", "#297192", "#d1a09c", 
"#78579e", "#81ffad", "#739400", "#ca6949", "#d9bf01", "#646a58", "#d5097e", "#bb73a9", 
"#ccf6e9", "#9cb4b6", "#b6a7d4", "#9e8c62", "#6e83c8", "#01af64", "#a71afd", "#cfe589", 
"#d4ccd1", "#fd4109", "#bf8f0e", "#2f786e", "#4ed1a5", "#d8bb7d", "#a54509", "#6a9276", 
"#a4777a", "#fc12c9", "#606f15", "#3cc4d9", "#f31c4e", "#73616f", "#f097c6", "#fc8772", 
"#92a6fe", "#875b44", "#699ab3", "#94bc19", "#7d5bf0", "#d24dfe", "#c85b74", "#68ff57", 
"#b62347", "#994b91", "#646b8c", "#977ab4", "#d694fd", "#c4d5b5", "#fdc4bd", "#1cae05", 
"#7bd972", "#e9700a", "#d08f5d", "#8bb9e1", "#fde945", "#a29d98", "#1682fb", "#9ad9e0", 
"#d6cafe", "#8d8328", "#b091a7", "#647579", "#1f8d11", "#e7eafd", "#b9660b", "#a4a644", 
"#fec24c", "#b1168c", "#188cc1", "#7ab297", "#c949a6", "#d48295", "#eb6dc2", "#d5b0cb", 
"#ff9ffb", "#fdb082", "#af4d44", "#a759c4", "#a9e03a", "#9ee3bd", "#5b8846", "#0d8995"];

var chartsDrawn = false;

var baseUrl = "https://blockvotenode2.mybluemix.net";
var wasDisplayingMessage = true;
var displayVoitingStartsMessage = false;
var showingError = false;
var display

function drawBarChart(data, idDiv,choices, w, h){
	d3.select("body").selectAll(idDiv).attr("width", w).attr("height",h);
	console.log("data", data);
	let svg = d3.select("body").selectAll(idDiv).append("svg")
		.attr("width", w)
		.attr("height", h),
    margin = {top: 20, right: 0, bottom: 30, left: 112},
    width = w - margin.left - margin.right,
    height = h - margin.top - margin.bottom;
	
	let color = d3.scaleOrdinal()
		.range(colors)
		.domain(choices);
		
		tooltip = d3.select("body").select(idDiv)
			.append("div")
			.attr("class", "tooltip")
			.style("position", "absolute")
			.style("z-index", "10")
			.style("visibility", "hidden")
	/*let x = d3.scaleBand().rangeRound([0, width]).padding(0.1),
		y = d3.scaleLinear().rangeRound([height, 0]);*/
		let y = d3.scaleBand().rangeRound([0, height]).padding(0.1),
		x = d3.scaleLinear().rangeRound([width, 0]);

	let g = svg.append("g")
		.attr("transform", "translate(" + margin.left + "," + margin.top + ")");

	/*x.domain(data.map(function(d) { return d.name; }));
	y.domain([0, d3.max(data, function(d) { return +d.value; })]);*/
	x.domain([d3.max(data, function(d) { return +d.value; }), 0]);
	y.domain(data.map(function(d) { return d.name }));

	g.append("g")
	  .attr("class", "axis axis--x")
	  .attr("transform", "translate(0," + height + ")")
	  //.call(d3.axisBottom(x));
	  .call(d3.axisBottom(x).ticks(10, "%"));
	  //.call(d3.axisBottom(y).ticks(10, "%"));

	g.append("g")
	  .attr("class", "axis axis--y")
	  //.call(d3.axisLeft(y).ticks(10, "%"))
	  .call(d3.axisLeft(y))
	  //.call(d3.axisLeft(x))
	.append("text")
	  .attr("transform", "rotate(-90)")
	  .attr("y", 6)
	  .attr("dy", "0.71em")
	  .attr("text-anchor", "end")
	  .text("value");

	g.selectAll(".bar")
	.data(data)
	.enter().append("rect")
	  .attr("class", "bar")
	  /*.attr("x", function(d) { return x(d.name); })
	  .attr("y", function(d) { return y(+d.value); })*/
	  .attr("x", function(d) { return 0; })
	  .attr("y", function(d) { return y(d.name); })
	  /*.attr("width", x.bandwidth())
	  .attr("height", function(d) { return height - y(+d.value); })*/
	  .attr("width", function(d) { return  x(+d.value); })
	  .attr("height", y.bandwidth())
	  .attr("fill", function(d){return color(d.name)})
	  .on("mouseover", function(d){
			d3.select(this).style("stroke","blue");
			tooltip.text(d.name + ": " + d.total);
			return tooltip.style("visibility", "visible");
		})
		.on("mousemove", function(event){return tooltip.style("top", (d3.event.pageY - 15)+"px").style("left",(d3.event.pageX +10)+"px");})
		.on("mouseout", function(){
			d3.select(this).style("stroke", "white");
			return tooltip.style("visibility", "hidden");
		});

}

function drawDonutCharts(radius, innerRadius, data, idDiv, choices, colors){
	let padding = 10;

	let color = d3.scaleOrdinal()
		//.range(["#98abc5", "#8a89a6", "#7b6888"]);
		.range(colors);

	let arc = d3.arc()
		.outerRadius(radius)
		.innerRadius(innerRadius);

	let pie = d3.pie()
		.sort(null)
		.value(function(d) { return d.value; });
		
	color.domain(choices);
	data.forEach(function(d) {
		d.votes = color.domain().map(function(name) {
			return {name: name, value: +d[name]};
		});
	});

	if(!chartsDrawn){
		let legend = d3.select("body").select(idDiv).append("svg")
			.attr("class", "legend")
			.attr("width", radius * 2)
			.attr("height", 20 * (choices.length + 1))
			//.attr("height", radius)
			.selectAll("g")
			.data(color.domain().slice().reverse())
			.enter().append("g")
			.attr("transform", function(d, i) { return "translate(0," + i * 20 + ")"; });

		legend.append("rect")
			.attr("width", 18)
			.attr("height", 18)
			.style("fill", color);

		legend.append("text")
			.attr("x", 24)
			.attr("y", 9)
			.attr("dy", ".35em")
			.text(function(d) { return d; })
			//.call(wrap, radius*2);
			
/*		
		legend.append("text")
			.data(splitChoices)
			.enter().append("tspan")
			.attr("x", 24)
			.attr("y", 9)
			.attr("dy", ".35em")
			.text(function(d) { return d; });*/
	}
	/*
	let datadiv = d3.select("body").selectAll(idDiv).selectAll(".dataDiv")
		.data(data)
		
		.enter().append("div")
		.attr("class","dataDiv")
		//.attr("width", radius * 2)
		//.attr("height", radius * 2);
		
	datadiv.append("svg")
		.attr("class", "pie")
		.attr("width", radius * 2)
		.attr("height", radius * 2)
		.append("g")
		.attr("transform", "translate(" + radius  + "," + radius + ")");*/

	let svg = d3.select("body").selectAll(idDiv).selectAll(".pie")
		.data(data)
		
		.enter().append("svg")
		.attr("class", "pie")
		.attr("width", radius * 2)
		.attr("height", radius * 2 + 20 * (choices.length + 1))
		.append("g")
		.attr("transform", "translate(" + radius + "," + radius + ")");
/*		
	let svg = d3.select("body").selectAll(idDiv).select(".dataDiv").selectAll(".pie")
		.data(data)
		
		.enter().append("svg")
		.attr("class", "pie")
		.attr("width", radius * 2)
		.attr("height", radius * 2)
		.append("g")
		.attr("transform", "translate(" + radius + "," + radius + ")");*/
	
	//let svg = d3.select("body").selectAll(idDiv).selectAll(".pie");
	let tooltip = d3.select("body").select(idDiv).select(".tooltip");
	if(!chartsDrawn){
		tooltip = d3.select("body").select(idDiv)
			.append("div")
			.attr("class", "tooltip")
			.style("position", "absolute")
			.style("z-index", "10")
			.style("visibility", "hidden")
	}


	svg.selectAll(".arc")
		.data(function(d) { return pie(d.votes); })
		
		.enter().append("path")
		.attr("class", "arc")
		.attr("d", arc)
		.style("fill", function(d) { return color(d.data.name); })
		.on("mouseover", function(d){
			d3.select(this).style("stroke","blue");
			tooltip.text(d.data.name + ": " + d.value);
			return tooltip.style("visibility", "visible");
		})
		//.on("mousemove", function(event){return tooltip.style("top", (d3.event.pageY -150)+"px").style("left",(d3.event.pageX - 300)+"px");})
		.on("mousemove", function(event){return tooltip.style("top", (d3.event.pageY - 15)+"px").style("left",(d3.event.pageX +10)+"px");})
		//.on("mousemove", function(event){return tooltip.style("top", (d3.select(this).attr("cy")-10)+"px").style("left",(d3.select(this).attr("cx")+10+10)+"px");})
		.on("mouseout", function(){
			d3.select(this).style("stroke", "white");
			return tooltip.style("visibility", "hidden");
		});
		


	svg.append("text")
		.attr("dy", ".35em")
		.style("text-anchor", "middle")
		.text(function(d) {return d.districtName;});
	for(let i = 0; i < choices.length; i++){
		svg.append("text")
			.attr("class", "voteCounts")
			.attr("dy", ".35em")
			.attr("x", "0")
			.attr("y", function(){ return  radius + (i + 1) * 20;}) 
			.style("text-anchor", "middle")
			.text(function(d) {return choices[i]  + ": " +  d[choices[i]];});
	}
}


function drawBubbleChart(data, idDiv, width, height){
	var div = d3.select(idDiv).attr("width",width).attr("height", height);
	
	/*var svg = d3.select(idDiv).select("svg"),
	width = +svg.attr("width"),
		height = +svg.attr("height");*/
	
	var svg = d3.select(idDiv).append("svg")
		.attr("id", "bubbleChartSVG")
		.attr("width", width)
		.attr("height", height)
		.attr("text-anchor","middle")
		.attr("font-size","10");
	
	var format = d3.format(",d");

	//var colorBubbleChart = d3.scaleOrdinal(d3.schemeCategory20c);
	var colorBubbleChart = d3.scaleOrdinal()
							.range(colors);

	var pack = d3.pack()
		.size([width, height])
		.padding(1.5);
	/*
	d3.csv("flare.csv", function(d) {
		d.value = +d.value;
		if (d.value) return d;
	}, function(error, classes) {
		if (error) throw error;*/

	var root = d3.hierarchy({children: data})
		.sum(function(d) { return d.votes; })
		.each(function(d) {
			if (id = d.data.districtName) {
				var id, i = id.lastIndexOf(".");
				d.id = id;
				d.package = id.slice(0, i);
				d.class = id.slice(i + 1);
			}
		});
		
	let tooltip = d3.select("body").select(idDiv).select(".tooltip");
	if(!chartsDrawn){
		tooltip = d3.select("body").select(idDiv)
			.append("div")
			.attr("class", "tooltip")
			.style("position", "absolute")
			.style("z-index", "10")
			.style("visibility", "hidden")
	}

	var node = svg.selectAll(".node")
		.data(pack(root).leaves())
		.enter().append("g")
		.attr("class", "node")
		.attr("transform", function(d) { return "translate(" + d.x + "," + d.y + ")"; });

	node.append("circle")
		.attr("id", function(d) { return d.id; })
		.attr("r", function(d) { return d.r; })
		.style("fill", function(d) { return colorBubbleChart(d.package); })
	.on("mouseover", function(d){
		d3.select(this).style("stroke","blue");
		tooltip.text("Voter count: " + d.value);
		return tooltip.style("visibility", "visible");
	})
	.on("mousemove", function(event){return tooltip.style("top", (d3.event.pageY - 15)+"px").style("left",(d3.event.pageX +10)+"px");})
	.on("mouseout", function(){
		d3.select(this).style("stroke", "white");
		return tooltip.style("visibility", "hidden");
	});

	node.append("clipPath")
		.attr("id", function(d) { return "clip-" + d.id; })
		.append("use")
		.attr("xlink:href", function(d) { return "#" + d.id; });

	node.append("text")
		.attr("clip-path", function(d) { return "url(#clip-" + d.id + ")"; })
		.selectAll("tspan")
		.data(function(d) { return d.class.split(/(?=[A-Z][^A-Z])/g); })
		.enter().append("tspan")
		.attr("x", 0)
		.attr("y", function(d, i, nodes) { return 13 + (i - nodes.length / 2 - 0.5) * 10; })
		.text(function(d) {return d; });
}


function drawCharts(choices, totalVotes, districtData){
	let dataTotal = [];
	/*dataTotal[0] = {districtName:"Total"};
	for(let i in choices){
		dataTotal[0][choices[i]] = totalVotes[choices[i]];
	}*/
	let voteTotal = 0;
	for(let i in choices){
		voteTotal = voteTotal + ( +totalVotes[choices[i]]);
	}
	console.log("voteTotal", voteTotal);
	for(let i in choices){
		let voteRatio = (+totalVotes[choices[i]]) / voteTotal;
		dataEntry = {name:choices[i], value:voteRatio, total:totalVotes[choices[i]]};
		dataTotal.push(dataEntry);
	}
	let dataDistrict = [];
	let dataBubble = [];
	for(let i in districtData){
		let resp = districtData[i][0].response;
		let respObj = JSON.parse(resp);
		let districtVotes = respObj.TotalVotes;
		let dataEntryDistrict = {districtName: respObj.DistrictName};
		let sumVotes = 0;
		for(let j in choices){
			dataEntryDistrict[choices[j]] = districtVotes[choices[j]];
			sumVotes += districtVotes[choices[j]];
		}
		if(sumVotes != 0)
			dataDistrict.push(dataEntryDistrict);
		let dataEntryBubbleChart = {districtName: respObj.DistrictName, votes: sumVotes};
		if(dataEntryBubbleChart.votes != 0)
			dataBubble.push(dataEntryBubbleChart);
	}
	
	let width =  0.4 * $( ".row.section-intro").width();
	if(width < 150 * 2)
	{	
		if($( ".row.section-intro").width() < 300)
			width = $( ".row.section-intro").width() 
		else
			width = 150 * 2;
	}
	
	console.log("data district ", dataDistrict );
	//drawDonutCharts(74, 44,  dataDistrict, "#districtResultCharts", choices, colors);
	drawDonutCharts(width/2, 0.7 * (width/2),  dataDistrict, "#districtResultCharts", choices, colors);
	//drawDonutCharts(150,100, dataTotal, "#totalResults", choices, colors );
	drawBarChart(dataTotal, "#totalResults",choices, $( ".row.section-intro").width(), 500);
	if(dataBubble.length != 0)
		drawBubbleChart(dataBubble, "#bubbleChart", $( ".row.section-intro").width(), 500);
	chartsDrawn = true; 
}



function poll(){
	   setTimeout (function () {
		  multAjaxCallResults(0,10);
	 }, 5000);
}

function deleteCharts(){
	/*let svg = d3.select("body").selectAll("#totalResults").selectAll(".pie");
	svg.remove();*/
	let svg = d3.select("body").selectAll("#totalResults");
	svg.selectAll("*").remove();
	 svg = d3.select("body").selectAll("#districtResultCharts").selectAll(".pie");
	svg.remove();
	let node =  d3.select("#bubbleChart").select("#bubbleChartSVG");
	node.remove();
	
}
var timeout;
function emptyResultsSection(){
	$("#resultsSection").empty();
	clearTimeout(timeout);
}
/*
function removeMessage(){
	$(".resultsMessage").remove();
}*/

function displayMessage(message){
	$("#resultsSection").append($('<h3>').text(message).addClass("resultsMessage"));
}

function addContainersForCharts(){
	$("#resultsSection").append($('<h5>').text("Total Results"));
	$("#resultsSection").append($('<div>').attr("id", "totalResults"));
	$("#resultsSection").append($('<h5>').text("Per District Results"));
	$("#resultsSection").append($('<div>').attr("id","districtResultCharts"));
	$("#resultsSection").append($('<h5>').text("Vote Counts Per District"));
	$("#resultsSection").append($('<div>').attr("id","bubbleChart"));
	let widthBubbleChart = $( ".row.section-intro").width();
	//d3.select("#bubbleChart").append("svg").attr("width","400").attr("height","400").attr("text-anchor","middle").attr("font-size","10");
	//d3.select("#bubbleChart").append("svg").attr("width", widthBubbleChart).attr("height","500").attr("text-anchor","middle").attr("font-size","10");
}

function noVotes(voteOptions, votes){
	let totalCount = 0; 
	for(let i in voteOptions){
		totalCount += votes[voteOptions[i]];
	}
	
	return totalCount ===0;
}

function afterDate(endDateString){
	let endDate = new Date(endDateString);
	let currentDate = new Date().getTime();
	return currentDate > endDate
}

function addCountDown(endTimeStr){
	$("#resultsSection").append($('<h3>').attr("id","countDown"));
	let tick = function(){
		let date1 = new Date(endTimeStr);
		let date2 = new Date();
		let timeDiff = date1.getTime()- date2.getTime();
		if(timeDiff > 0){
			let days = Math.floor(timeDiff / (1000 * 3600 * 24));
			timeDiff -= (days * (1000 * 3600 * 24));
			let hours = Math.floor(timeDiff / (1000 * 3600));
			timeDiff -= hours *1000 * 3600;
			let mins = Math.floor((timeDiff / ( 1000 * 60)));
			timeDiff -= mins * 1000 * 60;
			let sec = Math.floor(timeDiff / 1000);
			$("#countDown").text(days +" d, " +hours + " h, " + mins + " min, " + sec + " sec" );
		}
		timeout = setTimeout(tick, 1000);
	}
	tick();
}

function showError(){
	if(!chartsDrawn){
			emptyResultsSection();
			displayMessage("Sorry there was a problem getting the voting results.");
			wasDisplayingMessage = true;
		}
		else{
			window.alert("Problem getting voting results, results are no longer live");
		}
}


var options, totalVotes, args;

window.onresize = function(event){
	deleteCharts();
	drawCharts(options, totalVotes, args);
}

//perform multiple ajax calls in a loop if the server responds with error.
function multAjaxCallResults(count, finalCount){
	if(count < finalCount){
		$.ajax({
			url:baseUrl + "/results",
			crossDomain: true,
			success:function(resp){
				if(resp.error == null){
					let response = JSON.parse(resp.response);
					let voteOptions = response.VoteOptions;
					
					if(!afterDate(response.StartTime)){
						emptyResultsSection();
						displayMessage("Voting starts in");
						addCountDown(response.StartTime);
						wasDisplayingMessage = true;
						poll();
						return;
					}
					
					if(response.AllowLiveResults === "no" && !afterDate(response.EndTime)){
						emptyResultsSection();
						displayMessage("Live results are not enabled. Come back when the voting is over to see results");
						displayMessage("Time to end of election");
						addCountDown(response.EndTime);
						wasDisplayingMessage = true;
						poll();
						return;
					}
					
					if(noVotes(voteOptions, response.TotalVotes)){
						emptyResultsSection();
						displayMessage("No Votes Yet");
						wasDisplayingMessage = true;
						poll();
						return;
					}
					if(wasDisplayingMessage){
						emptyResultsSection();
						addContainersForCharts();
						wasDisplayingMessage = false;
					}
					
					let districts = response.Districts;
					let calls = [];
					for(let i in districts){
						
						let call = $.ajax({
							type:"POST",
							url:baseUrl + "/readDistrict",
							crossDomain: true,
							data: { "district":districts[i]},
							error:function(obj, status, textStatus){
								console.log("failure when getting district data");
								/*if(!showError)
									showError();
								showError = true;*/
							}
							
						});
						calls.push(call);
						
					}
					$.when.apply(null, calls).then(function(){
						let dataOK = true;
						for(let i in arguments){
							let resp = arguments[i][0];
							if(resp.error != null)
							{
								dataOK = false;
								count++;
								console.log("here " + count);
								multAjaxCallResults(count, finalCount);
							}
						}
						if(dataOK){
							deleteCharts();
							options = voteOptions;
							totalVotes = response.TotalVotes;
							args = arguments;
							drawCharts(options, totalVotes , args);
							poll();
						}
					});
				}
				else{
					count ++;
					multAjaxCallResults(count, finalCount);
				}
			},
			error:function(obj, status, textStatus){
				console.log("failure when getting results");
				//showError();
			}
		});
	}
	else{
		showError();
	}
}
	

$(window).load(function(){
	multAjaxCallResults(0, 10);
	
	
	/*$.ajax({
		url:"https://blockvotenode2.mybluemix.net/results",
		crossDomain: true,
		success:function(resp){
			/*console.log(resp);
			console.log(resp.response);*/
			/*let response = JSON.parse(resp.response);
			/*console.log(response);
			console.log("voteOptions:" + response.VoteOptions);
			console.log("Districts:" + response.Districts);*/
			/*let vOp = response.VoteOptions;
			let districts = response.Districts;
			let calls = [];
			for(let i in districts){
				let call = $.ajax({
					type:"POST",
					url: "https://blockvotenode2.mybluemix.net/readDistrict",
					crossDomain: true,
					data: { "district":districts[i]},
					failure:function(obj, status, textStatus){
						console.log("problem getting district data");
					}
					
				});
				
				calls.push(call);
				
			}
			$.when.apply(null, calls).then(function(){
				drawCharts(response.VoteOptions, response.TotalVotes , arguments);
			});
		},
		failure:function(obj, status, textStatus){
			console.log("fail");
		}
	});*/
	/*
	let choices = ["yes","no","maybe"];
		let colors = ["#98abc5", "#8a89a6", "#7b6888"];
	drawDonutCharts(74, 44,  data, "#districtResultCharts", choices, colors);
	drawDonutCharts(150,100, dataTotal, "#totalResults", choices, colors );
	drawBubbleChart(dataBubble, "#bubbleChart");*/
});